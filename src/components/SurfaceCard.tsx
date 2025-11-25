import React, { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { palette, layout, spacing } from '@/theme';

export const SurfaceCard = ({
  children,
  style,
  ...rest
}: PropsWithChildren<ViewProps>) => (
  <View style={[styles.card, style]} {...rest}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    borderWidth: 1, 
    borderColor: palette.border,
  },
});