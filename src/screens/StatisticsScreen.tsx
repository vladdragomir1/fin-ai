import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { 
  BarChart4, 
  TrendingUp, 
  PieChart, 
  Construction, 
  Lock, 
  ArrowRight 
} from 'lucide-react-native';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';

export const StatisticsScreen = () => {
  
  const FeatureItem = ({ label, icon: Icon, color }: { label: string, icon: any, color: string }) => (
    <View style={styles.featureRow}>
      <View style={[styles.iconBox, { backgroundColor: `${color}15` }]}>
        <Icon size={18} color={color} strokeWidth={1.5} />
      </View>
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Market Analytics</Text>
          <View style={styles.badge}>
            <Construction size={12} color={palette.warning} />
            <Text style={styles.badgeText}>IN DEVELOPMENT</Text>
          </View>
        </View>

        {/* Main Placeholder Card */}
        <View style={styles.mainCard}>
          <View style={styles.illustrationContainer}>
            <View style={styles.circleOuter}>
              <View style={styles.circleInner}>
                <BarChart4 size={48} color={palette.accent} strokeWidth={1} />
              </View>
            </View>
          </View>
          
          <Text style={styles.cardTitle}>Advanced Terminal Offline</Text>
          <Text style={styles.cardDesc}>
            We are currently compiling high-frequency trading algorithms and global market indices for this module.
          </Text>

          <View style={styles.lockedContainer}>
            <Lock size={14} color={palette.mutedText} />
            <Text style={styles.lockedText}>Module Locked • v2.0 Update</Text>
          </View>
        </View>

        {/* Roadmap Section */}
        <View style={styles.roadmapContainer}>
          <Text style={styles.sectionHeader}>UPCOMING CAPABILITIES</Text>
          
          <View style={styles.roadmapCard}>
            <FeatureItem 
              label="Real-time Sector Heatmaps" 
              icon={PieChart} 
              color={palette.primary} 
            />
            <View style={styles.divider} />
            <FeatureItem 
              label="Portfolio Performance Attribution" 
              icon={TrendingUp} 
              color={palette.success} 
            />
            <View style={styles.divider} />
            <FeatureItem 
              label="Global Indices & Macro Trends" 
              icon={BarChart4} 
              color={palette.accent} 
            />
          </View>
        </View>

      </ScrollView>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // Header
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  badgeText: {
    color: palette.warning,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  mainCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.xl,
  },
  illustrationContainer: {
    marginBottom: spacing.lg,
  },
  circleOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  circleInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.surfaceHighlight,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  cardDesc: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  lockedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  lockedText: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '500',
  },

  // Roadmap
  roadmapContainer: {
    marginTop: spacing.sm,
  },
  sectionHeader: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    marginLeft: 4,
  },
  roadmapCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  featureText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: palette.surfaceHighlight,
    marginVertical: spacing.sm,
    marginLeft: 48, 
  },
});