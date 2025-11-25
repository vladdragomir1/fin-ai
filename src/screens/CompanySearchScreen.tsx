import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
} from 'react-native';
import { 
  Search, 
  Star, 
  ArrowRight, 
  Building2, 
  Globe, 
  AlertCircle 
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell } from '@/components';
import { financeApiService } from '@/services/financeApiService';
import { useWatchlist } from '@/context/WatchlistContext';
import { palette, spacing, layout } from '@/theme';
import type { Company } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CompanySearchScreen = () => {
  // --- LOGIC (Preserved 100%) ---
  const navigation = useNavigation<NavigationProp>();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);

    try {
      const companies = await financeApiService.searchCompanies(query);
      setResults(companies);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = (company: Company) => {
    navigation.navigate('CompanyDetails', {
      symbol: company.symbol,
      name: company.name,
    });
  };

  const handleToggleFavorite = async (company: Company) => {
    if (isInWatchlist(company.symbol)) {
      await removeFromWatchlist(company.symbol);
    } else {
      await addToWatchlist(company.symbol, company.name);
    }
  };

  // --- RENDER ---
  return (
    <ScreenShell scrollable={false}>
      <View style={styles.container}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Market Search</Text>
          <Text style={styles.screenSubtitle}>Find assets by ticker or name</Text>
        </View>

        {/* Search Input Bar - Glass Style */}
        <View style={styles.searchContainer}>
          <View style={styles.inputWrapper}>
            <Search size={20} color={palette.mutedText} style={styles.searchIcon} />
            <TextInput
              placeholder="Search markets..."
              placeholderTextColor={palette.mutedText}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="characters"
              style={styles.input}
              selectionColor={palette.accent}
            />
            {loading ? (
              <ActivityIndicator size="small" color={palette.accent} style={styles.actionIcon} />
            ) : (
              <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
                <ArrowRight size={20} color={palette.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results List */}
        {results.length > 0 ? (
          <View style={styles.listContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>{results.length} ASSETS FOUND</Text>
            </View>
            <FlatList
              data={results}
              keyExtractor={(item) => item.symbol}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isFavorite = isInWatchlist(item.symbol);
                return (
                  <TouchableOpacity 
                    onPress={() => handleSelectCompany(item)}
                    style={styles.resultCard}
                    activeOpacity={layout.activeOpacity}
                  >
                    {/* Left: Ticker Box */}
                    <View style={styles.tickerBox}>
                      <Text style={styles.tickerText}>{item.symbol}</Text>
                    </View>

                    {/* Middle: Info */}
                    <View style={styles.infoContainer}>
                      <Text style={styles.companyName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.metaRow}>
                        <Building2 size={12} color={palette.mutedText} />
                        <Text style={styles.metaText}>{item.exchange}</Text>
                        <View style={styles.dot} />
                        <Globe size={12} color={palette.mutedText} />
                        <Text style={styles.metaText}>{item.currency}</Text>
                      </View>
                    </View>

                    {/* Right: Action */}
                    <TouchableOpacity 
                      onPress={() => handleToggleFavorite(item)}
                      style={styles.favoriteButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Star 
                        size={20} 
                        color={isFavorite ? palette.warning : palette.mutedText} 
                        fill={isFavorite ? palette.warning : 'transparent'}
                        strokeWidth={1.5}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        ) : (
          // Empty States
          <View style={styles.emptyStateContainer}>
            {!searched ? (
              <>
                <Search size={48} color={palette.surfaceHighlight} />
                <Text style={styles.emptyTitle}>Exploration Terminal</Text>
                <Text style={styles.emptyText}>
                  Enter a symbol (e.g., AAPL) to begin analysis.
                </Text>
              </>
            ) : (
              !loading && (
                <>
                  <AlertCircle size={48} color={palette.surfaceHighlight} />
                  <Text style={styles.emptyTitle}>No Assets Found</Text>
                  <Text style={styles.emptyText}>
                    We couldn't find "{query}". Check the ticker symbol.
                  </Text>
                </>
              )
            )}
          </View>
        )}
      </View>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  
  // Header
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  screenTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    color: palette.mutedText,
    fontSize: 14,
    marginTop: 4,
  },

  // Search Bar
  searchContainer: {
    marginBottom: spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    height: 56,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    height: '100%',
  },
  actionIcon: {
    marginLeft: spacing.sm,
  },
  searchButton: {
    padding: spacing.xs,
    backgroundColor: palette.surfaceHighlight,
    borderRadius: 8,
    marginLeft: spacing.sm,
  },

  // List Styles
  listContainer: {
    flex: 1,
  },
  resultsHeader: {
    marginBottom: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceHighlight,
  },
  resultsCount: {
    color: palette.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },

  // Result Card
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.surfaceHighlight, // Subtle separation
  },
  tickerBox: {
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
  tickerText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  companyName: {
    color: palette.text,
    fontSize: 16,
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
    fontSize: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: palette.mutedText,
    marginHorizontal: 4,
  },
  favoriteButton: {
    padding: spacing.sm,
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100, // Visual balance
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 20,
  },
});