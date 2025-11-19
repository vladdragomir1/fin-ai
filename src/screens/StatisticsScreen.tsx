import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ScreenShell, SurfaceCard } from '@/components';
import { palette, spacing } from '@/theme';

export const StatisticsScreen = () => {
  return (
    <ScreenShell>
      <View style={styles.header}>
        <Text style={styles.title}>Market Statistics</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
      </View>

      <SurfaceCard>
        <View style={styles.emptyContainer}>
          <Icon name="bar-chart" size={64} color={palette.mutedText} />
          <Text style={styles.emptyTitle}>Market Analytics</Text>
          <Text style={styles.emptyText}>
            Advanced market statistics and analytics will be available here soon.
          </Text>
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.infoCard}>
        <Text style={styles.infoTitle}>Upcoming Features:</Text>
        <View style={styles.featureItem}>
          <Icon name="trending-up" size={20} color={palette.primary} />
          <Text style={styles.featureText}>Market trends and indices</Text>
        </View>
        <View style={styles.featureItem}>
          <Icon name="analytics" size={20} color={palette.secondary} />
          <Text style={styles.featureText}>Portfolio performance tracking</Text>
        </View>
        <View style={styles.featureItem}>
          <Icon name="stats-chart" size={20} color={palette.accent} />
          <Text style={styles.featureText}>Sector analysis and comparisons</Text>
        </View>
      </SurfaceCard>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoCard: {
    marginTop: spacing.md,
  },
  infoTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  featureText: {
    color: palette.text,
    fontSize: 14,
  },
});
