import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ActivityIndicator, 
  TouchableOpacity,
  FlatList
} from 'react-native';
import { 
  Building2,
  AlertCircle,
  ChevronRight,
  TrendingUp,
  TrendingDown
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';
import { financeApiService } from '@/services/financeApiService';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const BrowseStocksScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stocks, setStocks] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStocks(1);
  }, []);

  const loadStocks = async (page: number) => {
    if (page === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    setError(null);

    try {
      const response = await financeApiService.getMarketTickers(page, 'STOCKS');
      
      if (page === 1) {
        setStocks(response.body || []);
      } else {
        setStocks(prev => [...prev, ...(response.body || [])]);
      }
      
      setTotalRecords(response.meta?.totalrecords || 0);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error loading stocks:', err);
      setError('Failed to load stocks');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadNextPage = () => {
    if (!loadingMore && stocks.length < totalRecords) {
      loadStocks(currentPage + 1);
    }
  };

  const handleStockPress = (stock: any) => {
    navigation.navigate('CompanyDetails', {
      symbol: stock.symbol,
      name: stock.name || stock.shortName || stock.longName || stock.symbol
    });
  };

  const formatMarketCap = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toFixed(2)}`;
  };

  const renderStockCard = ({ item }: { item: any }) => {
    const isPositive = (item.regularMarketChangePercent || 0) >= 0;
    const ChangeIcon = isPositive ? TrendingUp : TrendingDown;
    const changeColor = isPositive ? palette.success : palette.danger;

    return (
      <TouchableOpacity 
        onPress={() => handleStockPress(item)}
        style={styles.stockCard}
        activeOpacity={layout.activeOpacity}
      >
        {/* Left: Symbol Badge */}
        <View style={styles.symbolBadge}>
          <Text style={styles.symbolText}>{item.symbol}</Text>
        </View>

        {/* Middle: Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.stockName} numberOfLines={1}>
            {item.name || item.shortName || item.longName || item.symbol}
          </Text>
          <View style={styles.metaRow}>
            <Building2 size={11} color={palette.mutedText} />
            <Text style={styles.metaText}>{item.exchange || 'N/A'}</Text>
            {item.marketCap && (
              <>
                <View style={styles.dot} />
                <Text style={styles.metaText}>{formatMarketCap(item.marketCap)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Right: Price & Change */}
        <View style={styles.priceContainer}>
          {item.regularMarketPrice && (
            <Text style={styles.priceText}>
              ${typeof item.regularMarketPrice === 'number' 
                ? item.regularMarketPrice.toFixed(2) 
                : parseFloat(item.regularMarketPrice).toFixed(2)}
            </Text>
          )}
          {item.regularMarketChangePercent !== undefined && (
            <View style={[styles.miniChangeBadge, { backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
              <ChangeIcon size={10} color={changeColor} />
              <Text style={[styles.miniChangeText, { color: changeColor }]}>
                {isPositive ? '+' : ''}
                {typeof item.regularMarketChangePercent === 'number'
                  ? item.regularMarketChangePercent.toFixed(2)
                  : parseFloat(item.regularMarketChangePercent).toFixed(2)}%
              </Text>
            </View>
          )}
        </View>

        {/* Arrow */}
        <ChevronRight size={16} color={palette.surfaceHighlight} style={{ marginLeft: spacing.xs }} />
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={palette.accent} />
        <Text style={styles.footerText}>Loading more stocks...</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading stocks...</Text>
      </View>
    );
  }

  return (
    <ScreenShell scrollable={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Browse Stocks</Text>
          <Text style={styles.subtitle}>
            {totalRecords > 0 ? `${totalRecords.toLocaleString()} stocks sorted by market cap` : 'Explore all listed stocks'}
          </Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <AlertCircle size={20} color={palette.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Stock List */}
        <FlatList
          data={stocks}
          keyExtractor={(item, index) => `${item.symbol}-${index}`}
          renderItem={renderStockCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <AlertCircle size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No stocks available</Text>
            </View>
          }
        />
      </View>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: palette.mutedText,
    marginTop: spacing.md,
    fontSize: 14,
  },
  
  // Header
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: palette.mutedText,
    fontSize: 14,
    marginTop: 4,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.dangerBg,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    marginBottom: spacing.md,
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    flex: 1,
  },

  // List
  listContent: {
    paddingBottom: spacing.xxl,
  },

  // Stock Card
  stockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
  },
  symbolBadge: {
    width: 48,
    height: 48,
    backgroundColor: palette.surfaceHighlight,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  symbolText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  stockName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: palette.mutedText,
    fontSize: 11,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: palette.mutedText,
    marginHorizontal: 2,
  },
  priceContainer: {
    alignItems: 'flex-end',
    marginRight: spacing.sm,
  },
  priceText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  miniChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  miniChangeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Footer Loader
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  footerText: {
    color: palette.mutedText,
    fontSize: 13,
  },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: palette.mutedText,
    marginTop: spacing.md,
    fontSize: 14,
  },
});
