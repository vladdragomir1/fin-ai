import React, { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '@/theme';

interface Props extends ViewProps {
  scrollable?: boolean;
}

export const ScreenShell = ({
  children,
  scrollable = true,
  style,
}: PropsWithChildren<Props>) => (
  <SafeAreaView style={styles.safeArea}>
    {scrollable ? (
      <ScrollView 
        contentContainerStyle={[styles.content, style]}
        nestedScrollEnabled={true}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.fill, style]}>{children}</View>
    )}
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  fill: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  content: {
    padding: 20,
    gap: 16,
  },
});
