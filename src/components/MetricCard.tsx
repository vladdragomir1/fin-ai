import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, spacing, layout } from '@/theme';

interface Props {
  label: string;
  value: string;
  trend?: string;
  icon?: React.ElementType; 
  variant?: 'positive' | 'negative' | 'neutral';
}

export const MetricCard = ({ 
  label, 
  value, 
  trend, 
  icon: Icon, 
  variant = 'neutral' 
}: Props) => {
  
  const getTrendColor = () => {
    switch (variant) {
      case 'positive': return palette.success;
      case 'negative': return palette.danger;
      default: return palette.mutedText;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header: Label + Optional Icon */}
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {Icon && (
          <Icon 
            size={16} 
            color={palette.mutedText} 
            strokeWidth={1.5} 
            style={styles.icon}
          />
        )}
      </View>

      {/* Main Value */}
      <Text 
        style={styles.value} 
        numberOfLines={1} 
        adjustsFontSizeToFit
      >
        {value}
      </Text>

      {/* Footer: Trend Indicator */}
      {trend && (
        <View style={styles.trendContainer}>
          <Text style={[styles.trend, { color: getTrendColor() }]}>
            {trend}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: '45%', 
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  icon: {
    opacity: 0.7,
  },
  label: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  value: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  trendContainer: {
    marginTop: 6,
  },
  trend: {
    fontSize: 12,
    fontWeight: '500',
  },
});