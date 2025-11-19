import React, { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { palette, radius } from '@/theme';

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
    backgroundColor: palette.card,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
});
