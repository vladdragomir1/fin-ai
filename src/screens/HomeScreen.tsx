import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell, SectionHeader, SurfaceCard } from '@/components';
import { palette, spacing } from '@/theme';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FinAI</Text>
          <Text style={styles.title}>Beyond the Ticker</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsButton}>
          <Icon name="cog-outline" size={20} color={palette.mutedText} />
          <Text style={styles.settingsText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <SectionHeader title="Features" />
      
      <TouchableOpacity onPress={() => navigation.navigate('Root', { screen: 'Search' })}>
        <SurfaceCard style={styles.featureCard}>
          <View style={styles.featureRow}>
            <Icon name="briefcase" size={24} color={palette.primary} />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Company Search</Text>
              <Text style={styles.featureDesc}>Search by ticker symbol (AAPL, MSFT, etc.)</Text>
            </View>
          </View>
        </SurfaceCard>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Root', { screen: 'Statistics' })}>
        <SurfaceCard style={styles.featureCard}>
          <View style={styles.featureRow}>
            <Icon name="bar-chart" size={24} color={palette.secondary} />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Financial Metrics</Text>
              <Text style={styles.featureDesc}>P/E Ratio, Market Cap, EPS, and more</Text>
            </View>
          </View>
        </SurfaceCard>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Root', { screen: 'AI' })}>
        <SurfaceCard style={styles.featureCard}>
          <View style={styles.featureRow}>
            <Icon name="flash" size={24} color={palette.accent} />
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>AI Analyst</Text>
              <Text style={styles.featureDesc}>Ask questions about companies and get insights</Text>
            </View>
          </View>
        </SurfaceCard>
      </TouchableOpacity>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: palette.mutedText,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '600',
    marginTop: 4,
  },
  iconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.card,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  iconLabel: {
    color: palette.mutedText,
    fontSize: 13,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  settingsText: {
    color: palette.mutedText,
    fontSize: 13,
    fontWeight: '500',
  },
  featureCard: {
    marginBottom: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDesc: {
    color: palette.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
});
