import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  ActivityIndicator, 
  TouchableOpacity,
  FlatList
} from 'react-native';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  AlertCircle
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';
import { financeApiService } from '@/services/financeApiService';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'GAINERS' | 'LOSERS' | 'ACTIVE';

export const MarketMoversScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [viewMode, setViewMode] = useState<ViewMode>('GAINERS');
  const [loading, setLoading] = useState(true);
  const [gainers, setGainers] = useState<any[]>([]);
  const [losers, setLosers] = useState<any[]>([]);
  const [mostActive, setMostActive] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    // Lazy load based on tab selection
    if (viewMode === 'GAINERS' && gainers.length === 0) {
      loadGainers();
    } else if (viewMode === 'LOSERS' && losers.length === 0) {
      loadLosers();
    } else if (viewMode === 'ACTIVE' && mostActive.length === 0) {
      loadMostActive();
    }
  }, [viewMode]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    await loadGainers();
    setLoading(false);
  };

  const loadGainers = async () => {
    try {
      const data = await financeApiService.getMarketGainers();
      setGainers(data);
    } catch (err) {
      console.error('Error loading gainers:', err);
      setError('Failed to load market gainers');
    }
  };

  const loadLosers = async () => {
    try {
      const data = await financeApiService.getMarketLosers();
      setLosers(data);
    } catch (err) {
      console.error('Error loading losers:', err);
      setError('Failed to load market losers');
    }
  };

  const loadMostActive = async () => {
    try {
      const data = await financeApiService.getMostActive();
      setMostActive(data);
    } catch (err) {
      console.error('Error loading most active:', err);
      setError('Failed to load most active stocks');
    }
  };

  const handleStockPress = (stock: any) => {
    navigation.navigate('CompanyDetails', {
      symbol: stock.symbol,
      name: stock.name || stock.shortName || stock.longName || stock.symbol
    });
  };

  const getCurrentData = () => {
    switch (viewMode) {
      case 'GAINERS': return gainers;
      case 'LOSERS': return losers;
      case 'ACTIVE': return mostActive;
      default: return [];
    }
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

        {/* Middle: Name & Details */}
        <View style={styles.infoContainer}>
          <Text style={styles.stockName} numberOfLines={1}>
            {item.name || item.shortName || item.longName || item.symbol}
          </Text>
          <Text style={styles.priceText}>
            ${typeof item.regularMarketPrice === 'number' 
              ? item.regularMarketPrice.toFixed(2) 
              : parseFloat(item.regularMarketPrice || '0').toFixed(2)}
          </Text>
        </View>

        {/* Right: Change Badge */}
        <View style={[styles.changeBadge, { backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
          <ChangeIcon size={14} color={changeColor} />
          <Text style={[styles.changeText, { color: changeColor }]}>
            {isPositive ? '+' : ''}
            {typeof item.regularMarketChangePercent === 'number'
              ? item.regularMarketChangePercent.toFixed(2)
              : parseFloat(item.regularMarketChangePercent || '0').toFixed(2)}%
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading market movers...</Text>
      </View>
    );
  }

  return (
    <ScreenShell scrollable={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Market Movers</Text>
          <Text style={styles.subtitle}>Real-time gainers, losers & most active</Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <AlertCircle size={20} color={palette.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Segmented Control */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            onPress={() => setViewMode('GAINERS')}
            style={[styles.segment, viewMode === 'GAINERS' && styles.segmentActive]}
            activeOpacity={0.7}
          >
            <TrendingUp size={16} color={viewMode === 'GAINERS' ? palette.success : palette.mutedText} />
            <Text style={[styles.segmentText, viewMode === 'GAINERS' && styles.segmentTextActive, { color: viewMode === 'GAINERS' ? palette.success : palette.mutedText }]}>
              Gainers
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setViewMode('LOSERS')}
            style={[styles.segment, viewMode === 'LOSERS' && styles.segmentActive]}
            activeOpacity={0.7}
          >
            <TrendingDown size={16} color={viewMode === 'LOSERS' ? palette.danger : palette.mutedText} />
            <Text style={[styles.segmentText, viewMode === 'LOSERS' && styles.segmentTextActive, { color: viewMode === 'LOSERS' ? palette.danger : palette.mutedText }]}>
              Losers
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setViewMode('ACTIVE')}
            style={[styles.segment, viewMode === 'ACTIVE' && styles.segmentActive]}
            activeOpacity={0.7}
          >
            <Activity size={16} color={viewMode === 'ACTIVE' ? palette.accent : palette.mutedText} />
            <Text style={[styles.segmentText, viewMode === 'ACTIVE' && styles.segmentTextActive, { color: viewMode === 'ACTIVE' ? palette.accent : palette.mutedText }]}>
              Most Active
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stock List */}
        <FlatList
          data={getCurrentData()}
          keyExtractor={(item, index) => `${item.symbol}-${index}`}
          renderItem={renderStockCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <AlertCircle size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No data available</Text>
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

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
    gap: 6,
  },
  segmentActive: {
    backgroundColor: palette.surfaceHighlight,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.mutedText,
  },
  segmentTextActive: {
    fontWeight: '700',
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
    width: 50,
    height: 50,
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
    fontSize: 13,
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
  priceText: {
    color: palette.mutedText,
    fontSize: 13,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '700',
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
