import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { Bot, Sparkles } from 'lucide-react-native';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';

export const AIChatScreen = () => {
  return (
    <ScreenShell>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Sparkles size={18} color={palette.accent} />
          <Text style={styles.title}>FinAI Assistant</Text>
        </View>
        <Text style={styles.subtitle}>Powered by PHI-3-mini</Text>
      </View>

      <View style={styles.chatContainer}>
        <View style={styles.emptyState}>
          <View style={styles.iconCircle}>
            <Bot size={48} color={palette.text} strokeWidth={1} />
          </View>
          <Text style={styles.emptyTitle}>How can I help you today?</Text>
          <Text style={styles.emptyText}>
            Ask about market trends, company fundamentals, or technical analysis.
          </Text>
        </View>
        
        {/* Placeholder for input area - Visual only */}
        <View style={styles.inputArea}>
          <Text style={styles.inputPlaceholder}>Ask a question...</Text>
        </View>
      </View>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.mutedText,
    fontSize: 14,
  },
  chatContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -60, // Visual offset
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: palette.mutedText,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 22,
  },
  inputArea: {
    backgroundColor: palette.surface,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
  },
  inputPlaceholder: {
    color: palette.mutedText,
  }
});