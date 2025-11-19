import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { palette, radius } from '@/theme';

interface Props {
  label: string;
  value: string;
  trend?: string;
  icon?: string;
  variant?: 'positive' | 'negative' | 'neutral';
}

const trendColor = {
  positive: palette.success,
  negative: palette.danger,
  neutral: palette.mutedText,
};

export const MetricCard = ({ label, value, trend, icon, variant = 'neutral' }: Props) => (
  <View style={styles.container}>
    {icon && (
      <View style={styles.iconBadge}>
        <Icon name={icon} size={20} color={palette.text} />
      </View>
    )}
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
    {trend ? <Text style={[styles.trend, { color: trendColor[variant] }]}>{trend}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  label: {
    color: palette.mutedText,
    fontSize: 13,
  },
  value: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '600',
  },
  trend: {
    marginTop: 6,
    fontSize: 13,
  },
});
