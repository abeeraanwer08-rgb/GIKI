import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { askInsights, ApiError } from '../services/insightsService';
import ChatBubble, { ChatMessage } from '../components/insights/ChatBubble';
import Txt from '../ui/Txt';
import FocusStatusBar from '../ui/FocusStatusBar';
import { colors, fonts, gradients, radius, spacing } from '../ui/theme';

const SUGGESTIONS: { text: string; language: string }[] = [
  { text: 'What did I spend the most on?', language: 'English' },
  { text: 'Is mahine kitna kharcha hua?', language: 'Roman Urdu' },
  { text: 'میرا سب سے بڑا خرچ کیا تھا؟', language: 'اردو' },
  { text: 'Any unusual spending this month?', language: 'English' },
];

const WELCOME: ChatMessage = {
  id: 0,
  role: 'assistant',
  text:
    'Assalam o Alaikum! I’m HissabAI. Ask me anything about your saved expenses — in English, Urdu or Roman Urdu. My answers only use your real numbers.',
};

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const nextId = useRef(1);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [question, setQuestion] = useState('');
  const asking = messages.some((m) => m.role === 'pending');

  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || asking) return;

    const userId = nextId.current;
    const pendingId = userId + 1;
    nextId.current += 2;
    setQuestion('');
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: trimmed },
      { id: pendingId, role: 'pending', text: '' },
    ]);
    scrollToEnd();

    let reply: ChatMessage;
    try {
      const result = await askInsights(trimmed);
      reply = { id: pendingId, role: 'assistant', text: result.answer };
    } catch (error) {
      reply = {
        id: pendingId,
        role: 'error',
        text:
          error instanceof ApiError && error.status === 503
            ? 'The AI service is temporarily unavailable. Please try again shortly.'
            : 'Could not get an answer. Check your connection and try again.',
      };
    }
    setMessages((prev) => prev.map((m) => (m.id === pendingId ? reply : m)));
    scrollToEnd();
  };

  const showSuggestions = messages.length === 1;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FocusStatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <LinearGradient colors={gradients.brandSoft} style={styles.avatar}>
          <Ionicons name="sparkles" size={20} color={colors.inkInverse} />
        </LinearGradient>
        <View style={styles.headerText}>
          <Txt variant="heading">HissabAI Assistant</Txt>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Txt variant="caption" color={colors.inkMuted}>
              English · اردو · Roman Urdu
            </Txt>
          </View>
        </View>
        {messages.length > 1 && (
          <Pressable
            onPress={() => setMessages([WELCOME])}
            style={styles.clear}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            hitSlop={8}
          >
            <Ionicons name="refresh" size={18} color={colors.inkSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}

        {showSuggestions && (
          <View style={styles.suggestions}>
            <Txt variant="overline" color={colors.inkMuted} style={styles.suggestionsTitle}>
              Try asking
            </Txt>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s.text}
                onPress={() => ask(s.text)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Txt variant="label" style={styles.suggestionText}>
                  {s.text}
                </Txt>
                <View style={styles.langTag}>
                  <Txt variant="caption" color={colors.primary} style={styles.langText}>
                    {s.language}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask about your spending…"
          placeholderTextColor={colors.inkMuted}
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={() => ask(question)}
          returnKeyType="send"
          multiline={false}
        />
        <Pressable
          onPress={() => ask(question)}
          disabled={!question.trim() || asking}
          style={[styles.send, (!question.trim() || asking) && styles.sendDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send question"
        >
          <Ionicons name="arrow-up" size={20} color={colors.inkInverse} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginLeft: spacing.md },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  clear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: { padding: spacing.xl, paddingBottom: spacing.lg },
  suggestions: { marginTop: spacing.lg },
  suggestionsTitle: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    marginBottom: spacing.sm,
  },
  suggestionText: { flex: 1, marginRight: spacing.sm },
  langTag: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  langText: { fontFamily: fonts.semibold, fontSize: 11 },
  pressed: { opacity: 0.8 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 50,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
