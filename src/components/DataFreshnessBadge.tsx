import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Wifi, WifiOff, Clock } from 'lucide-react-native';
import { palette, spacing } from '@/theme';
import { formatTimeAgo, isMarketOpen, isExtendedHours } from '@/utils/marketHours';

interface DataFreshnessBadgeProps {
  /** Timestamp when data was cached (in ms) */
  cachedAt?: number;
  /** Whether data was freshly fetched from API (not from cache) */
  isLive?: boolean;
  /** Compact mode for tight spaces */
  compact?: boolean;
  /** Custom style override */
  style?: object;
}

/**
 * DataFreshnessBadge Component
 * Shows users whether they're viewing live data or cached data
 * Adapts color based on data freshness relative to market hours
 */
export const DataFreshnessBadge = ({ 
  cachedAt, 
  isLive = false, 
  compact = false,
  style 
}: DataFreshnessBadgeProps) => {
  
  // Determine freshness status
  const getFreshnessInfo = () => {
    if (!cachedAt) {
      return { 
        status: 'unknown', 
        label: 'No data', 
        color: palette.mutedText,
        bgColor: palette.surface,
        icon: WifiOff
      };
    }

    const ageMs = Date.now() - cachedAt;
    const ageMin = ageMs / (1000 * 60);
    const marketOpen = isMarketOpen();
    const extendedHours = isExtendedHours();

    // Live data (just fetched from API) - only show if explicitly marked as live
    if (isLive) {
      return {
        status: 'live',
        label: 'Live',
        color: palette.success,
        bgColor: palette.successBg,
        icon: Wifi
      };
    }

    // During market hours - stricter freshness requirements
    if (marketOpen) {
      if (ageMin < 5) {
        return {
          status: 'fresh',
          label: formatTimeAgo(cachedAt),
          color: palette.success,
          bgColor: palette.successBg,
          icon: Wifi
        };
      }
      if (ageMin < 15) {
        return {
          status: 'stale',
          label: formatTimeAgo(cachedAt),
          color: palette.warning,
          bgColor: 'rgba(245, 158, 11, 0.1)',
          icon: Clock
        };
      }
      // Old data during market hours
      return {
        status: 'outdated',
        label: formatTimeAgo(cachedAt),
        color: palette.danger,
        bgColor: palette.dangerBg,
        icon: WifiOff
      };
    }

    // During extended hours - moderate requirements
    if (extendedHours) {
      if (ageMin < 15) {
        return {
          status: 'fresh',
          label: formatTimeAgo(cachedAt),
          color: palette.success,
          bgColor: palette.successBg,
          icon: Wifi
        };
      }
      if (ageMin < 60) {
        return {
          status: 'cached',
          label: formatTimeAgo(cachedAt),
          color: palette.warning,
          bgColor: 'rgba(245, 158, 11, 0.1)',
          icon: Clock
        };
      }
    }

    // Market closed - cached data is fine
    const ageHr = ageMin / 60;
    if (ageHr < 24) {
      return {
        status: 'cached',
        label: formatTimeAgo(cachedAt),
        color: palette.secondary,
        bgColor: palette.surface,
        icon: Clock
      };
    }

    // Very old data
    return {
      status: 'outdated',
      label: formatTimeAgo(cachedAt),
      color: palette.mutedText,
      bgColor: palette.surface,
      icon: WifiOff
    };
  };

  const { label, color, bgColor, icon: Icon } = getFreshnessInfo();

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: bgColor }, style]}>
        <Icon size={10} color={color} strokeWidth={2} />
        <Text style={[styles.compactLabel, { color }]}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor: color }, style]}>
      <Icon size={12} color={color} strokeWidth={2} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    gap: 3,
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
