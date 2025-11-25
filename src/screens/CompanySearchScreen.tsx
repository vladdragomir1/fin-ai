import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell, SectionHeader, SurfaceCard } from '@/components';
import { financeApiService } from '@/services/financeApiService';
import { useWatchlist } from '@/context/WatchlistContext';
import { palette, spacing } from '@/theme';
import type { Company } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CompanySearchScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }

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

  if (!loading && results.length > 0) {
    return (
      <ScreenShell scrollable={false}>
        <SectionHeader title="Search Companies" />
        <SurfaceCard style={styles.searchCard}>
          <TextInput
            placeholder="Symbol or company name"
            placeholderTextColor={palette.mutedText}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="characters"
            style={styles.input}
          />
          <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </SurfaceCard>
        <SectionHeader title={`${results.length} results`} />
        <FlatList
          data={results}
          keyExtractor={item => item.symbol}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <SurfaceCard style={styles.resultCard}>
              <TouchableOpacity 
                onPress={() => handleSelectCompany(item)}
                style={styles.resultContent}>
                <View style={styles.resultInfo}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.symbol}>{item.symbol}</Text>
                    <Text style={styles.exchange}>{item.exchange}</Text>
                  </View>
                  <Text style={styles.companyName}>{item.name}</Text>
                  <Text style={styles.country}>
                    {item.country} • {item.currency}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => handleToggleFavorite(item)}
                style={styles.favoriteButton}>
                <Icon 
                  name={isInWatchlist(item.symbol) ? 'star' : 'star-outline'} 
                  size={24} 
                  color={isInWatchlist(item.symbol) ? palette.warning : palette.mutedText} 
                />
              </TouchableOpacity>
            </SurfaceCard>
          )}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <SectionHeader title="Search Companies" />

      <SurfaceCard style={styles.searchCard}>
        <TextInput
          placeholder="Symbol or company name"
          placeholderTextColor={palette.mutedText}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="characters"
          style={styles.input}
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </SurfaceCard>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      )}

      {!loading && searched && results.length === 0 && (
        <SurfaceCard>
          <Text style={styles.emptyText}>No results found for "{query}"</Text>
          <Text style={styles.hintText}>
            Try searching by symbol (e.g., AAPL, GOOGL) or company name
          </Text>
        </SurfaceCard>
      )}

      {!searched && (
        <SurfaceCard>
          <Text style={styles.welcomeText}>Search for a company</Text>
          <Text style={styles.hintText}>
            Enter the ticker symbol or company name to view details and financial analysis.
          </Text>
        </SurfaceCard>
      )}
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  searchCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: palette.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.text,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchButtonText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: palette.mutedText,
    marginTop: spacing.md,
    fontSize: 16,
  },
  emptyText: {
    color: palette.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  hintText: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  resultCard: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultContent: {
    flex: 1,
  },
  resultInfo: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  favoriteButton: {
    padding: spacing.xs,
  },
  symbol: {
    color: palette.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  exchange: {
    color: palette.mutedText,
    fontSize: 12,
    backgroundColor: palette.card,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  companyName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: spacing.xxs,
  },
  country: {
    color: palette.mutedText,
    fontSize: 13,
  },
  welcomeText: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  examplesContainer: {
    marginTop: spacing.md,
  },
  examplesTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  exampleChip: {
    backgroundColor: palette.card,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  exampleText: {
    color: palette.text,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
});