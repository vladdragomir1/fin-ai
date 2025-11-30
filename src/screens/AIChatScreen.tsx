import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform, 
  Text, 
  Modal
} from 'react-native';
import { Bot, Sparkles, Send, Menu, Plus, MessageSquare, X, Trash2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ScreenShell } from '@/components';
import { palette, spacing } from '@/theme';
import { AiService } from '@/services/aiService';

// --- Types ---
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  lastModified: number;
  messages: Message[];
}

const STORAGE_KEY = '@finai_chats';

export const AIChatScreen = () => {
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [modelStatus, setModelStatus] = useState<'LOADING' | 'READY' | 'MISSING'>('LOADING');
  const [isSidebarVisible, setSidebarVisible] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  
  // Ref to track active session ID inside async functions (Fixes the switching bug)
  const activeSessionRef = useRef<string | null>(null);

  // 1. Initialize AI & Load History
  useEffect(() => {
    const init = async () => {
      await loadSessions();
      console.log("Initializing AI...");
      const success = await AiService.init();
      setModelStatus(success ? 'READY' : 'MISSING');
    };
    init();
    return () => { AiService.release(); };
  }, []);

  // Sync Ref with State
  useEffect(() => {
    activeSessionRef.current = currentSessionId;
  }, [currentSessionId]);

  // 2. Load Sessions from Storage
  const loadSessions = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        const parsed = JSON.parse(json);
        parsed.sort((a: ChatSession, b: ChatSession) => b.lastModified - a.lastModified);
        setSessions(parsed);
        if (parsed.length > 0) loadSession(parsed[0]);
        else startNewChat();
      } else {
        startNewChat();
      }
    } catch (e) {
      console.error("Failed to load chats", e);
    }
  };

  const saveSessionsToStorage = async (updatedSessions: ChatSession[]) => {
    try {
      setSessions(updatedSessions);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSessions));
    } catch (e) { console.error(e); }
  };

  // 4. Session Logic
  const startNewChat = () => {
    setIsTyping(false); // Reset typing state
    setInputText('');
    setSidebarVisible(false);

    const newId = Date.now().toString();
    const welcomeMsg: Message = { 
      id: 'welcome', 
      text: 'Hello! I am FinAI. Ask me about market trends, stock analysis, or your portfolio.', 
      sender: 'ai',
      timestamp: Date.now()
    };

    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      lastModified: Date.now(),
      messages: [welcomeMsg]
    };

    setCurrentSessionId(newId);
    setMessages([welcomeMsg]);
    
    setSessions(prev => {
        const updated = [newSession, ...prev];
        saveSessionsToStorage(updated);
        return updated;
    });
  };

  const loadSession = (session: ChatSession) => {
    setIsTyping(false); // Reset typing state immediately
    setInputText('');
    setSidebarVisible(false);
    
    setCurrentSessionId(session.id);
    setMessages(session.messages);
  };

  const deleteSession = (id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    saveSessionsToStorage(updated);
    if (currentSessionId === id) {
      if (updated.length > 0) loadSession(updated[0]);
      else startNewChat();
    }
  };

  // 5. Send Logic (With Concurrency Fix)
  const handleSend = async () => {
    if (!inputText.trim() || modelStatus !== 'READY') return;

    // Capture current ID to prevent race conditions
    const chatContextId = currentSessionId;
    if (!chatContextId) return;

    const userText = inputText.trim();
    const userMsg: Message = { id: Date.now().toString(), text: userText, sender: 'user', timestamp: Date.now() };
    
    // Optimistic UI Update
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // Save User Message (Functional Update)
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === chatContextId) {
            const newTitle = s.title === 'New Chat' ? (userText.slice(0, 25) + '...') : s.title;
            return { ...s, messages: [...s.messages, userMsg], title: newTitle, lastModified: Date.now() };
        }
        return s;
      });
      saveSessionsToStorage(updated);
      return updated;
    });

    try {
      const responseText = await AiService.generateResponse(userText, {});
      const aiMsg: Message = { id: (Date.now() + 1).toString(), text: responseText, sender: 'ai', timestamp: Date.now() };
      
      // Only update UI if user is still looking at THIS chat
      if (activeSessionRef.current === chatContextId) {
          setMessages(prev => [...prev, aiMsg]);
          setIsTyping(false);
      }

      // Save AI Message (Background Safe)
      setSessions(prev => {
        const updated = prev.map(s => 
          s.id === chatContextId 
            ? { ...s, messages: [...s.messages, aiMsg], lastModified: Date.now() }
            : s
        );
        updated.sort((a, b) => b.lastModified - a.lastModified);
        saveSessionsToStorage(updated);
        return updated;
      });

    } catch (error) {
      if (activeSessionRef.current === chatContextId) {
          setMessages(prev => [...prev, { id: 'err', text: 'Error thinking.', sender: 'ai', timestamp: Date.now() }]);
          setIsTyping(false);
      }
    }
  };

  // --- Render Helpers ---
  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.msgWrapper, isUser ? styles.userWrapper : styles.aiWrapper]}>
        {!isUser && (
          <View style={styles.aiIcon}>
            <Sparkles size={16} color="#FFF" />
          </View>
        )}
        <View style={[styles.msgBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          {isUser ? (
            <Text style={styles.msgText}>{item.text}</Text>
          ) : (
            <Markdown style={markdownStyles as any}>{item.text}</Markdown>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenShell scrollable={false}>
      {/* --- HEADER --- */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSidebarVisible(true)} style={styles.menuBtn}>
          <Menu size={24} color={palette.text} />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>FinAI</Text>
          <View style={styles.modelTag}>
            <Text style={styles.modelTagText}>Llama 3.2</Text>
          </View>
        </View>

        <View style={[styles.statusDot, { backgroundColor: modelStatus === 'READY' ? palette.success : palette.danger }]} />
      </View>

      {/* --- CHAT AREA --- */}
      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {isTyping && (
          <View style={styles.typingContainer}>
            <ActivityIndicator size="small" color={palette.accent} />
            <Text style={styles.typingText}>Analyst is thinking...</Text>
          </View>
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          keyboardVerticalOffset={100}
        >
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={modelStatus === 'READY' ? "Ask anything..." : "Downloading brain..."}
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
              <Send size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* --- SIDEBAR --- */}
      <Modal
        visible={isSidebarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSidebarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sidebar}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarHeading}>Chat History</Text>
                <TouchableOpacity onPress={() => setSidebarVisible(false)} style={styles.closeBtn}>
                  <X size={24} color={palette.mutedText} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}>
                <Plus size={20} color="#FFF" />
                <Text style={styles.newChatText}>New Chat</Text>
              </TouchableOpacity>

              <FlatList 
                data={sessions}
                keyExtractor={item => item.id}
                contentContainerStyle={{paddingHorizontal: 16}}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.historyItem, item.id === currentSessionId && styles.historyItemActive]}
                    onPress={() => loadSession(item)}
                  >
                    <MessageSquare size={18} color={item.id === currentSessionId ? '#FFF' : palette.mutedText} />
                    <Text style={[styles.historyText, item.id === currentSessionId && { color: '#FFF' }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <TouchableOpacity onPress={() => deleteSession(item.id)} style={styles.deleteBtn}>
                      <Trash2 size={16} color={palette.danger} opacity={0.7} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            </SafeAreaView>
          </View>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSidebarVisible(false)} />
        </View>
      </Modal>

    </ScreenShell>
  );
};

// --- STYLES ---
const markdownStyles = {
  body: { color: '#E1E1E1', fontSize: 16, lineHeight: 24 },
  heading3: { color: '#A5B4FC', fontSize: 18, fontWeight: 'bold', marginTop: 12 },
  strong: { fontWeight: 'bold', color: '#FFFFFF' },
  bullet_list: { marginVertical: 6 },
  code_inline: { backgroundColor: '#2D2D30', color: '#FFD700', borderRadius: 4, paddingHorizontal: 6 },
};

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: palette.background, 
  },
  menuBtn: { padding: 8, marginLeft: -8 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: palette.text },
  modelTag: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  modelTagText: { fontSize: 10, color: palette.mutedText, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Chat Layout
  chatContainer: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },

  // Bubbles
  msgWrapper: { marginBottom: 20, flexDirection: 'row', alignItems: 'flex-end' },
  userWrapper: { justifyContent: 'flex-end' },
  aiWrapper: { justifyContent: 'flex-start' },
  aiIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.accent, justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 4 },
  
  msgBubble: { padding: 16, borderRadius: 20, maxWidth: '85%' },
  userBubble: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#1E1E1E', borderBottomLeftRadius: 4 },
  msgText: { color: '#FFF', fontSize: 16, lineHeight: 24 },

  // Typing
  typingContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 20, marginBottom: 12, gap: 8 },
  typingText: { color: palette.mutedText, fontSize: 12 },

  // FIXED INPUT AREA
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end', // Aligns button to bottom
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 28,
    padding: 8, // Extra padding for spacing
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    color: '#FFF',
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlignVertical: 'center', // Fix Android text alignment
  },
  sendBtn: {
    backgroundColor: '#2563EB',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4, // Align visually with text
    marginLeft: 8,
  },

  // Sidebar
  modalOverlay: { flex: 1, flexDirection: 'row' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sidebar: { 
    width: '85%', 
    backgroundColor: '#121212', 
    height: '100%', 
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)'
  },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  sidebarHeading: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },
  closeBtn: { padding: 8 },
  
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  newChatText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  historyItemActive: { backgroundColor: 'rgba(37, 99, 235, 0.15)' },
  historyText: { color: palette.mutedText, fontSize: 15, flex: 1, fontWeight: '500' },
  deleteBtn: { padding: 8 },
});