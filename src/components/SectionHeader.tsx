import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme';

interface Props {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const SectionHeader = ({ title, actionLabel, onActionPress }: Props) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {actionLabel && onActionPress ? (
      <Text style={styles.action} onPress={onActionPress}>
        {actionLabel}
      </Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
  },
  action: {
    fontSize: 14,
    color: palette.secondary,
  },
});
