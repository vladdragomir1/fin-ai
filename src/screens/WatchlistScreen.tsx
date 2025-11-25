import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { 
  Star, 
  TrendingUp, 
  BookmarkMinus, 
  Info, 
  ArrowUpRight 
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell } from '@/components';
import { useWatchlist } from '@/context/WatchlistContext';
import { palette, spacing, layout } from '@/theme';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const WatchlistScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { watchlist, removeFromWatchlist } = useWatchlist();

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
        data={watchlist}
        keyExtractor={item => item.symbol}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => handleSelectCompany(item.symbol, item.name)}
            style={styles.card}
            activeOpacity={layout.activeOpacity}
          >
            {/* Icon Box */}
            <View style={styles.tickerBox}>
              <TrendingUp size={20} color={palette.text} strokeWidth={1.5} />
            </View>

            {/* Content */}
            <View style={styles.cardContent}>
              <View style={styles.symbolRow}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <ArrowUpRight size={14} color={palette.mutedText} />
              </View>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            </View>

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
        )}
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
  name: {
    color: palette.mutedText,
    fontSize: 13,
  },
  actionButton: {
    padding: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)', // Very subtle amber tint
    borderRadius: 10,
  },
});