import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { Bot, Sparkles, Send } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display'; 

import { ScreenShell } from '@/components';
import { palette, spacing } from '@/theme';
import { AiService } from '@/services/aiService';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

export const AIChatScreen = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [modelStatus, setModelStatus] = useState<'LOADING' | 'READY' | 'MISSING'>('LOADING');
  const flatListRef = useRef<FlatList>(null);

  // 1. Initialize AI on Mount
  useEffect(() => {
    const initAI = async () => {
      console.log("Initializing AI...");
      const success = await AiService.init();
      setModelStatus(success ? 'READY' : 'MISSING');
      
      if (success) {
        setMessages([{ 
          id: 'welcome', 
          text: 'Hello! I am your local financial analyst. Ask me about any stocks & ETFs.', 
          sender: 'ai' 
        }]);
      } else {
        setMessages([{ 
          id: 'error', 
          text: 'Brain Missing! \n\nDeveloper: Connect USB and run:\n"adb push D:\\app\\llama-3.2-1b-instruct-q4_k_m.gguf /sdcard/Android/data/com.financeai.app/files/"', 
          sender: 'ai' 
        }]);
      }
    };

    initAI();
    return () => { AiService.release(); };
  }, []);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    if (modelStatus !== 'READY') return;

    const userText = inputText.trim();
    const userMsg: Message = { id: Date.now().toString(), text: userText, sender: 'user' };
    
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const responseText = await AiService.generateResponse(userText, { transactions: [], budgets: [], insights: [] });
      const aiMsg: Message = { id: (Date.now() + 1).toString(), text: responseText, sender: 'ai' };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: 'err', text: 'I encountered an error thinking.', sender: 'ai' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[
        styles.msgBubble, 
        isUser ? styles.userBubble : styles.aiBubble
      ]}>
        {!isUser && (
          <View style={styles.botIconSmall}>
            <Bot size={16} color="#4F8EF7" />
          </View>
        )}
        
        {/* LOGIC: Use Text for User, Markdown for AI */}
        {isUser ? (
          <Text style={styles.msgText}>{item.text}</Text>
        ) : (
          <Markdown style={markdownStyles as any}>
            {item.text}
          </Markdown>
        )}
      </View>
    );
  };

  return (
    <ScreenShell scrollable={false}>
      <View style={styles.header}>
        <View>
          <View style={styles.titleRow}>
            <Sparkles size={18} color={palette.accent} />
            <Text style={styles.title}>FinAI Assistant</Text>
          </View>
          <Text style={styles.subtitle}>Powered by Llama-3.2</Text>
        </View>
        
        <View style={[styles.badge, 
          modelStatus === 'READY' ? styles.badgeReady : 
          modelStatus === 'MISSING' ? styles.badgeError : styles.badgeLoading
        ]}>
          <Text style={styles.badgeText}>{modelStatus}</Text>
        </View>
      </View>

      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.iconCircle}>
                <Bot size={48} color={palette.text} strokeWidth={1} />
              </View>
              <Text style={styles.emptyTitle}>
                {modelStatus === 'LOADING' ? 'Initializing Brain...' : 'How can I help you today?'}
              </Text>
              <Text style={styles.emptyText}>
                Ask about market trends, company fundamentals, or technical analysis.
              </Text>
            </View>
          }
        />

        {isTyping && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.typingText}>Analyzing market data...</Text>
          </View>
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          keyboardVerticalOffset={100}
        >
          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              placeholder={modelStatus === 'READY' ? "Ask a question..." : "Waiting for model..."}
              placeholderTextColor={palette.mutedText}
              value={inputText}
              onChangeText={setInputText}
              editable={modelStatus === 'READY'}
              multiline
            />
            <TouchableOpacity 
              onPress={handleSend} 
              disabled={modelStatus !== 'READY' || !inputText.trim()}
              style={[styles.sendBtn, { opacity: inputText.trim() ? 1 : 0.5 }]}
            >
              <Send size={20} color={palette.surface} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </ScreenShell>
  );
};

// --- STYLES FOR MARKDOWN (AI Output) ---
const markdownStyles = {
  // The main text color
  body: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    lineHeight: 22 
  },
  // Headings (e.g. ### Overview)
  heading3: { 
    color: '#4da6ff', // Light Blue
    fontSize: 18, 
    fontWeight: 'bold', 
    marginTop: 10, 
    marginBottom: 5 
  },
  // Bold text (**text**)
  strong: { 
    fontWeight: 'bold',
    color: '#E1E1E1' 
  },
  // Lists
  bullet_list: { marginVertical: 5 },
  // Tables
  table: { 
    borderWidth: 1, 
    borderColor: '#444', 
    borderRadius: 8, 
    marginTop: 8,
    marginBottom: 8
  },
  tr: { 
    borderBottomWidth: 1, 
    borderColor: '#444', 
    flexDirection: 'row', 
    alignItems: 'center'
  },
  th: { 
    backgroundColor: '#333', 
    padding: 8, 
    color: '#FFF', 
    fontWeight: 'bold',
  },
  td: { 
    padding: 8, 
    color: '#DDD',
    minWidth: 80 
  }
};

// --- STYLES FOR SCREEN ---
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeReady: { backgroundColor: 'rgba(76, 175, 80, 0.2)' },
  badgeError: { backgroundColor: 'rgba(255, 82, 82, 0.2)' },
  badgeLoading: { backgroundColor: 'rgba(255, 193, 7, 0.2)' },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: palette.text },
  chatContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  msgBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#2C2C2E',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  msgText: {
    color: '#FFFFFF', 
    fontSize: 16,
    lineHeight: 22,
  },
  botIconSmall: { marginBottom: 6 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
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
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: 8,
    gap: 8,
  },
  typingText: { color: palette.mutedText, fontSize: 12 },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: palette.surface,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  input: {
    flex: 1,
    color: palette.text,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: palette.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
});