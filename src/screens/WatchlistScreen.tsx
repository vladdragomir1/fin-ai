import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell, SectionHeader, SurfaceCard } from '@/components';
import { useWatchlist } from '@/context/WatchlistContext';
import { palette, spacing } from '@/theme';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const WatchlistScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { watchlist, removeFromWatchlist } = useWatchlist();

  const handleSelectCompany = (symbol: string, name: string) => {
    navigation.navigate('CompanyDetails', { symbol, name });
  };

  if (watchlist.length === 0) {
    return (
      <ScreenShell>
        <View style={styles.header}>
          <Text style={styles.title}>Watchlist</Text>
        </View>

        <SurfaceCard>
          <View style={styles.emptyContainer}>
            <Icon name="star-outline" size={48} color={palette.mutedText} />
            <Text style={styles.emptyTitle}>Your watchlist is empty</Text>
            <Text style={styles.emptyText}>
              Add companies to your watchlist to track them quickly
            </Text>
          </View>
        </SurfaceCard>

        <SectionHeader title="How it works?" />
        
        <SurfaceCard>
          <Text style={styles.infoText}>
            1. Search for a company in the Search tab{'\n'}
            2. Tap the ⭐ icon next to the company{'\n'}
            3. It will be added to your watchlist
          </Text>
        </SurfaceCard>
      </ScreenShell>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        <Text style={styles.subtitle}>{watchlist.length} companies</Text>
      </View>

      <FlatList
        data={watchlist}
        keyExtractor={item => item.symbol}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SurfaceCard style={styles.companyCard}>
            <TouchableOpacity 
              onPress={() => handleSelectCompany(item.symbol, item.name)}
              style={styles.companyContent}>
              <View style={styles.companyInfo}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.companyName}>{item.name}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => removeFromWatchlist(item.symbol)}
              style={styles.removeButton}>
              <Icon name="star" size={24} color={palette.warning} />
            </TouchableOpacity>
          </SurfaceCard>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    padding: 20,
    paddingBottom: spacing.md,
    paddingTop: 60,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    color: palette.mutedText,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
  },
  infoText: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 24,
  },
  listContent: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 100,
  },
  companyCard: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  companyContent: {
    flex: 1,
  },
  companyInfo: {
    flex: 1,
  },
  symbol: {
    color: palette.primary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xxs,
  },
  companyName: {
    color: palette.text,
    fontSize: 14,
  },
  removeButton: {
    padding: spacing.xs,
  },
});
