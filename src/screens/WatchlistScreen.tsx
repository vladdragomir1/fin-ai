import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { 
  Star, 
  TrendingUp, 
  TrendingDown,
  BookmarkMinus, 
  Info, 
  ArrowUpRight 
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell, DataFreshnessBadge } from '@/components';
import { useWatchlist } from '@/context/WatchlistContext';
import { financeApiService } from '@/services/financeApiService';
import { tradingViewPriceService } from '@/services/tradingViewPriceService';
import { palette, spacing, layout } from '@/theme';
import type { RootStackParamList } from '@/navigation/types';
import type { StockQuote } from '@/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface WatchlistItemWithQuote {
  symbol: string;
  name: string;
  quote?: StockQuote;
  loading?: boolean;
}

export const WatchlistScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const [itemsWithQuotes, setItemsWithQuotes] = useState<WatchlistItemWithQuote[]>([]);

  useEffect(() => {
    // Initialize items with loading state
    setItemsWithQuotes(watchlist.map(item => ({ ...item, loading: true })));
    
    // Fetch quotes for all watchlist items
    const fetchQuotes = async () => {
      const quotesPromises = watchlist.map(async (item) => {
        try {
          const quote = await financeApiService.getStockQuote(item.symbol);
          return { ...item, quote: quote || undefined, loading: false };
        } catch (error) {
          console.error(`Error fetching quote for ${item.symbol}:`, error);
          return { ...item, loading: false };
        }
      });

      const results = await Promise.all(quotesPromises);
      setItemsWithQuotes(results);
    };

    if (watchlist.length > 0) {
      fetchQuotes();
    }

    // Poll for TradingView price updates
    const interval = setInterval(() => {
      // Update items with TradingView prices if available
      setItemsWithQuotes(current => 
        current.map(item => {
          const tvPrice = tradingViewPriceService.getPrice(item.symbol);
          if (tvPrice && !item.quote) {
            // Use TradingView price if API quote not available
            return {
              ...item,
              quote: {
                symbol: item.symbol,
                price: tvPrice.price,
                change: tvPrice.change,
                changePercent: tvPrice.changePercent,
                volume: 0,
                high: 0,
                low: 0,
                open: 0,
                previousClose: 0,
                timestamp: new Date().toISOString(),
              },
              loading: false,
            };
          }
          return item;
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [watchlist]);

  const handleSelectCompany = (symbol: string, name: string) => {
    navigation.navigate('CompanyDetails', { symbol, name });
  };

  // --- EMPTY STATE ---
  if (watchlist.length === 0) {
    return (
      <ScreenShell>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <BookmarkMinus size={32} color={palette.mutedText} />
          </View>
          <Text style={styles.emptyTitle}>Portfolio Empty</Text>
          <Text style={styles.emptyText}>
            Track assets by marking them with a star in the search terminal.
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionHeader}>QUICK GUIDE</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Info size={16} color={palette.accent} style={{ marginTop: 2 }} />
              <Text style={styles.infoText}>
                Navigate to <Text style={styles.highlight}>Search</Text>, find a ticker, and tap the <Text style={styles.highlight}>Star icon</Text> to pin it here for quick access.
              </Text>
            </View>
          </View>
        </View>
      </ScreenShell>
    );
  }

  // --- LIST STATE ---
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Watchlist</Text>
          <Text style={styles.subtitle}>{watchlist.length} Assets Tracking</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={itemsWithQuotes}
        keyExtractor={item => item.symbol}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isPositive = (item.quote?.changePercent || 0) >= 0;
          const TrendIcon = isPositive ? TrendingUp : TrendingDown;
          const changeColor = isPositive ? palette.success : palette.danger;

          return (
            <TouchableOpacity 
              onPress={() => handleSelectCompany(item.symbol, item.name)}
              style={styles.card}
              activeOpacity={layout.activeOpacity}
            >
              {/* Icon Box */}
              <View style={styles.tickerBox}>
                <TrendIcon size={20} color={palette.text} strokeWidth={1.5} />
              </View>

              {/* Content */}
              <View style={styles.cardContent}>
                <View style={styles.symbolRow}>
                  <Text style={styles.symbol}>{item.symbol}</Text>
                  <ArrowUpRight size={14} color={palette.mutedText} />
                </View>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  {item.quote?.cachedAt && (
                    <DataFreshnessBadge cachedAt={item.quote.cachedAt} compact />
                  )}
                </View>
              </View>

              {/* Price & Change */}
              {item.loading ? (
                <ActivityIndicator size="small" color={palette.mutedText} style={styles.priceLoader} />
              ) : item.quote ? (
                <View style={styles.priceSection}>
                  <Text style={styles.priceValue}>${item.quote.price.toFixed(2)}</Text>
                  <View style={[styles.changeBadge, { backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                    <TrendIcon size={10} color={changeColor} />
                    <Text style={[styles.changeText, { color: changeColor }]}>
                      {isPositive ? '+' : ''}{item.quote.changePercent.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Action (Remove) */}
              <TouchableOpacity 
                onPress={() => removeFromWatchlist(item.symbol)}
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Star 
                  size={20} 
                  color={palette.warning} 
                  fill={palette.warning} 
                />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingTop: 60, // Safe area top
  },
  
  // Header
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: palette.mutedText,
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    marginTop: spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 20,
  },
  infoSection: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm, // Shell has padding, just fine tuning
  },
  sectionHeader: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: palette.surface,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  infoText: {
    color: palette.mutedText,
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  highlight: {
    color: palette.text,
    fontWeight: '600',
  },

  // List Styles
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.surfaceHighlight,
  },
  tickerBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  symbol: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: palette.mutedText,
    fontSize: 13,
    flex: 1,
  },
  actionButton: {
    padding: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)', // Very subtle amber tint
    borderRadius: 10,
    marginLeft: spacing.sm,
  },
  
  // Price Display
  priceSection: {
    alignItems: 'flex-end',
    marginRight: spacing.sm,
    gap: 4,
  },
  priceValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceLoader: {
    marginRight: spacing.sm,
  },
});