import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { WebView } from 'react-native-webview';
import { palette, layout, spacing } from '@/theme';

interface Props {
  symbol: string;
  height?: number;
}

export const TradingViewChart = ({ symbol, height = 400 }: Props) => {
  const netInfo = useNetInfo();

  // If offline, show a friendly message
  if (netInfo.isConnected === false) { 
    return (
      <View style={[styles.container, { height, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.offlineText}>Chart unavailable offline</Text>
      </View>
    );
  }

  const getExchange = (sym: string): string => {
    const nyseStocks = [
      'GE', 'IBM', 'DIS', 'BA', 'WMT', 'JPM', 'V', 'MA', 'BAC', 'C', 'WFC',
      'UNH', 'JNJ', 'PG', 'HD', 'KO', 'PFE', 'VZ', 'T', 'XOM', 'CVX',
      'MRK', 'ABT', 'TMO', 'DHR', 'UPS', 'NEE', 'HON', 'UNP', 'LIN', 'CAT',
      'RTX', 'DE', 'MMM', 'AXP', 'GS', 'MS', 'SPGI', 'BLK', 'USB', 'TFC',
      'PNC', 'COF', 'DD', 'DOW', 'EMR', 'GD', 'LMT', 'NOC', 'ITW', 'MMC',
      'AIG', 'MET', 'PRU', 'TRV', 'ALL', 'AFL', 'CB', 'PGR', 'HUM', 'CI',
      'CVS', 'WBA', 'MCK', 'ABC', 'CAH', 'ANTM', 'ELV', 'CNC', 'F', 'GM',
      'RACE', 'TM', 'HMC', 'FCX', 'NEM', 'GOLD', 'AA', 'CLF', 'X', 'NUE'
    ];
    
    const nasdaqStocks = [
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO',
      'ASML', 'COST', 'PEP', 'CSCO', 'TMUS', 'CMCSA', 'ADBE', 'NFLX', 'INTC',
      'AMD', 'QCOM', 'TXN', 'AMAT', 'INTU', 'ISRG', 'BKNG', 'MU', 'ADI', 'LRCX',
      'KLAC', 'SNPS', 'CDNS', 'MRVL', 'FTNT', 'PANW', 'CRWD', 'DDOG', 'NET',
      'SNOW', 'SHOP', 'SQ', 'PYPL', 'ADYEN', 'MELI', 'SE', 'NU', 'COIN',
      'ABNB', 'UBER', 'LYFT', 'DASH', 'SPOT', 'ROKU', 'ZM', 'DOCU', 'TWLO',
      'OKTA', 'ZS', 'DKNG', 'RBLX', 'U', 'PLTR', 'RKLB', 'SOFI', 'HOOD', 'RIVN',
      'LCID', 'NIO', 'XPEV', 'LI', 'BYDDY', 'VWAGY', 'STLA', 'SBUX', 'MAR',
      'ORLY', 'AZO', 'ROST', 'DLTR', 'DG', 'MNST', 'KDP', 'MDLZ', 'BIIB',
      'GILD', 'AMGN', 'VRTX', 'REGN', 'MRNA', 'ILMN', 'IQV', 'IDXX', 'ALGN'
    ];

    if (nyseStocks.includes(sym.toUpperCase())) return 'NYSE';
    if (nasdaqStocks.includes(sym.toUpperCase())) return 'NASDAQ';
    
    const techPatterns = /^(A|Q|N|Z|S|T|M|C|D|P|R|O|K|L|I|U|F|B|E|G|H|W|V|Y|X)/i;
    return techPatterns.test(sym) ? 'NASDAQ' : 'NYSE';
  };

  const fullSymbol = `${getExchange(symbol)}:${symbol}`;
  
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
        "hide_side_toolbar": false,
        "allow_symbol_change": false,
        "show_popup_button": false,
        "withdateranges": true,
        "details": false,
        "hotlist": false,
        "calendar": false,
        "studies": ["MASimple@tv-basicstudies"],
        "disabled_features": ["use_localstorage_for_settings"],
        "enabled_features": ["hide_left_toolbar_by_default"]
      });
    </script>
  </body>
</html>
    `;
  }, [fullSymbol]);

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        androidLayerType="hardware"
        androidHardwareAccelerationDisabled={false}
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