import React, { useMemo, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { WebView } from 'react-native-webview';
import { palette, layout } from '@/theme';
import { tradingViewPriceService } from '@/services/tradingViewPriceService';

interface Props {
  symbol: string;
  height?: number;
  onPriceUpdate?: (price: number, change: number, changePercent: number) => void;
}

export const TradingViewChart = ({ symbol, height = 400, onPriceUpdate }: Props) => {
  const netInfo = useNetInfo();
  const webViewRef = useRef<WebView>(null);

  // Handle messages from WebView containing price data
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'priceUpdate') {
        const { price, change, changePercent } = data;
        tradingViewPriceService.setPrice(symbol, price, change, changePercent);
        if (onPriceUpdate) {
          onPriceUpdate(price, change, changePercent);
        }
      }
    } catch (error) {
      // Silently ignore parse errors
    }
  };

  // Smart Exchange Detection Logic
  // Instead of listing 5000 stocks, we use US Market conventions.
  const getFullSymbol = (sym: string): string => {
    const cleanSym = sym.toUpperCase().trim();

    // 1. Crypto Handling (If you ever add crypto)
    // Common crypto symbols usually don't look like stock tickers, 
    // but for Alpha Vantage we mostly care about stocks.
    if (cleanSym === 'BTC' || cleanSym === 'ETH') return `COINBASE:${cleanSym}USD`;

    // 2. Explicit Overrides for famous exceptions
    // Some 4-letter stocks are NYSE, some 3-letter are NASDAQ, but rare.
    // We can list just the weird ones here if needed.
    const nasdaqExceptions = ['META', 'NFLX', 'AMZN']; // These are standard length but good to ensure
    
    // 3. The "Wall Street Rule" (95% accuracy for US Market)
    // 1, 2, or 3 letters -> NYSE (e.g., F, T, GE, IBM)
    // 4 or more letters -> NASDAQ (e.g., AAPL, MSFT, TSLA, NVDA)
    if (cleanSym.length <= 3) {
      return `NYSE:${cleanSym}`;
    } else {
      return `NASDAQ:${cleanSym}`;
    }
  };

  const fullSymbol = getFullSymbol(symbol);

  const htmlContent = useMemo(() => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background-color: ${palette.surface}; overflow: hidden; }
            #tradingview-widget { width: 100%; height: 100vh; }
          </style>
        </head>
        <body>
          <div id="tradingview-widget"></div>
          <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
          <script type="text/javascript">
            const widget = new TradingView.widget({
              "autosize": true,
              "symbol": "${fullSymbol}",
              "interval": "D",
              "timezone": "Etc/UTC",
              "theme": "dark",
              "style": "1",
              "locale": "en",
              "toolbar_bg": "${palette.surface}", 
              "enable_publishing": false,
              "hide_top_toolbar": false, 
              "hide_legend": false,
              "save_image": false,
              "container_id": "tradingview-widget",
              "backgroundColor": "${palette.surface}",
              "gridColor": "rgba(255, 255, 255, 0.06)",
              "hide_side_toolbar": true, 
              "allow_symbol_change": false,
              "details": false,
              "calendar": false,
              "studies": ["MASimple@tv-basicstudies"]
            });

            // Extract price data from TradingView widget
            widget.onChartReady(() => {
              setTimeout(extractPriceData, 1500);
              setInterval(extractPriceData, 3000);
            });

            function extractPriceData() {
              try {
                const bodyText = document.body.innerText || document.body.textContent || '';
                
                let price = null;
                let change = null;
                let changePercent = null;

                // TradingView format: "649.01 −1.06 (−0.16%)" or "649.01  -1.06 (-0.16%)"
                // Note: TradingView uses special minus sign (−) U+2212, not regular hyphen (-)
                
                // Pattern 1: Full match with price, change, and percent
                // Handle both regular minus (-) and unicode minus (−)
                const fullPattern = /(\\d{1,4}\\.\\d{2})\\s*[−-]?(\\d+\\.\\d{2})\\s*\\([−-]?(\\d+\\.\\d{2})%\\)/;
                const fullMatch = bodyText.match(fullPattern);
                
                if (fullMatch) {
                  price = parseFloat(fullMatch[1]);
                  change = -parseFloat(fullMatch[2]); // Assume negative if pattern matched
                  changePercent = -parseFloat(fullMatch[3]);
                }
                
                // Pattern 2: Try to find price and percentage separately
                if (!price) {
                  // Look for stock prices (reasonable range)
                  const priceMatches = bodyText.match(/\\b(\\d{1,4}\\.\\d{2})\\b/g);
                  if (priceMatches) {
                    for (const match of priceMatches) {
                      const testPrice = parseFloat(match);
                      // Stock prices typically between $1 and $5000
                      if (testPrice > 1 && testPrice < 5000) {
                        price = testPrice;
                        break;
                      }
                    }
                  }
                }
                
                // Find percentage change
                if (changePercent === null) {
                  // Match both regular minus and unicode minus
                  const percentPattern = /[−-]?(\\d+\\.\\d{2})%/;
                  const percentMatch = bodyText.match(percentPattern);
                  if (percentMatch) {
                    changePercent = parseFloat(percentMatch[1]);
                    // Check if there's a minus sign before it
                    if (bodyText.includes('-' + percentMatch[1]) || bodyText.includes('−' + percentMatch[1])) {
                      changePercent = -changePercent;
                    }
                  }
                }

                // Calculate change from percentage if not found
                if (price && changePercent !== null && change === null) {
                  change = price * (changePercent / 100);
                }

                // Send data if we have at least price
                if (price !== null) {
                  const payload = {
                    type: 'priceUpdate',
                    price: price,
                    change: change || 0,
                    changePercent: changePercent || 0
                  };
                  window.ReactNativeWebView.postMessage(JSON.stringify(payload));
                }
              } catch (error) {
                // Silent fail - price extraction is optional
              }
            }
          </script>
        </body>
      </html>
    `;
  }, [fullSymbol]);

  // Offline State
  if (netInfo.isConnected === false) {
    return (
      <View style={[styles.container, { height, justifyContent: 'center', alignItems: 'center' }]}> 
        <Text style={styles.offlineText}>Chart unavailable offline</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}> 
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="hardware"
        onMessage={handleWebViewMessage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: 20, 
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  offlineText: {
    color: palette.mutedText,
    fontSize: 14,
  },
});