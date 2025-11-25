import React, { PropsWithChildren } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  View, 
  ViewProps, 
  StatusBar,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '@/theme';

interface Props extends ViewProps {
  scrollable?: boolean;
  safeAreaEdges?: ('top' | 'right' | 'bottom' | 'left')[];
}

export const ScreenShell = ({
  children,
  scrollable = false, 
  style,
  safeAreaEdges = ['top', 'left', 'right'],
}: PropsWithChildren<Props>) => {
  
  const Container = scrollable ? ScrollView : View;

  return (
    <SafeAreaView 
      style={styles.safeArea} 
      edges={safeAreaEdges}
    >
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={palette.background} 
      />
      
      {scrollable ? (
        <ScrollView
          style={[styles.container, style]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.container, style]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
});