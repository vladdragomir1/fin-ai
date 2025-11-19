import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius } from '@/theme';
import { AiMessage } from '@/types';

interface Props {
  message: AiMessage;
}

export const MessageBubble = ({ message }: Props) => {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowReverse : undefined]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.text}>{message.content}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  rowReverse: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '86%',
    padding: 12,
    borderRadius: radius.md,
  },
  userBubble: {
    backgroundColor: palette.primary,
  },
  assistantBubble: {
    backgroundColor: palette.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  text: {
    color: palette.text,
  },
});
