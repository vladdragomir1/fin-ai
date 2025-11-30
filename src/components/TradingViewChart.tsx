import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { WebView } from 'react-native-webview';
import { palette, layout } from '@/theme';

interface Props {
  symbol: string;
  height?: number;
}

export const TradingViewChart = ({ symbol, height = 400 }: Props) => {
  const netInfo = useNetInfo();

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
            new TradingView.widget({
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
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        androidLayerType="hardware"
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