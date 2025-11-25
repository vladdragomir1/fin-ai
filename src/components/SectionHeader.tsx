import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { palette, spacing } from '@/theme';

interface Props {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: object;
}

export const SectionHeader = ({ title, actionLabel, onActionPress, style }: Props) => (
  <View style={[styles.container, style]}>
    <View style={styles.titleWrapper}>
      {/* Decorative vertical bar for visual hierarchy */}
      <View style={styles.accentBar} />
      <Text style={styles.title}>{title}</Text>
    </View>

    {actionLabel && onActionPress ? (
      <TouchableOpacity 
        onPress={onActionPress} 
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.action}>
          {actionLabel}
        </Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accentBar: {
    width: 3,
    height: 12,
    backgroundColor: palette.accent,
    borderRadius: 2,
    marginRight: spacing.xs,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  action: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.accent,
    letterSpacing: 0.5,
  },
});