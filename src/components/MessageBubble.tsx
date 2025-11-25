import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, spacing } from '@/theme';
import { AiMessage } from '@/types';

interface Props {
  message: AiMessage;
}

export const MessageBubble = ({ message }: Props) => {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowReverse : styles.rowStart]}>
      <View 
        style={[
          styles.bubble, 
          isUser ? styles.userBubble : styles.assistantBubble
        ]}
      >
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 6, 
    width: '100%',
  },
  rowReverse: {
    justifyContent: 'flex-end',
  },
  rowStart: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  
  userBubble: {
    backgroundColor: palette.accent, 
    borderBottomRightRadius: 4, 
  },
 
  assistantBubble: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomLeftRadius: 4, 
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF', 
  },
  assistantText: {
    color: palette.text, 
  },
});