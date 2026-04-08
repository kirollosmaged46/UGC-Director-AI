import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { fetch } from "expo/fetch";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useUGC } from "@/context/UGCContext";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SYSTEM_INTRO = "I'm your AI creative director. Tell me about your product — what it is, who it's for, and the vibe you're going for. I'll help shape the perfect generation prompt for authentic UGC content.";

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { conversationId, setConversationId, setCreativeVision } = useUGC();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content: SYSTEM_INTRO,
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const createConversation = useCallback(async (): Promise<number> => {
    const response = await fetch(`${baseUrl}/api/openai/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "UGC Direction Session" }),
    });
    const data = await response.json() as { id: number };
    return data.id;
  }, [baseUrl]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isSending) return;

    const userText = input.trim();
    setInput("");
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      id: Date.now().toString() + "u",
      role: "user",
      content: userText,
    };
    setMessages((prev) => [userMsg, ...prev]);

    let convId = conversationId;
    try {
      if (!convId) {
        convId = await createConversation();
        setConversationId(convId);
      }

      const streamingId = Date.now().toString() + "a";
      let accumulated = "";

      const response = await fetch(`${baseUrl}/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userText }),
      });

      if (!response.body) throw new Error("No stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setMessages((prev) => [
        { id: streamingId, role: "assistant", content: "", streaming: true },
        ...prev,
      ]);

      let sseBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";

        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; brief?: string; error?: string };
              if (payload.content) {
                accumulated += payload.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingId ? { ...m, content: accumulated } : m
                  )
                );
              }
              if (payload.done) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingId ? { ...m, streaming: false } : m
                  )
                );
                setCreativeVision(payload.brief && payload.brief.length > 0 ? payload.brief : accumulated);
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      }
    } catch (err) {
      Alert.alert("Error", "Failed to get response. Please try again.");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, conversationId, createConversation, setConversationId, setCreativeVision, baseUrl]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    return (
      <Animated.View entering={FadeIn.duration(300)} style={[styles.msgRow, isUser ? styles.userRow : styles.aiRow]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="flash" size={12} color="#fff" />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isUser ? colors.primary : colors.card,
              borderRadius: colors.radius,
              borderBottomRightRadius: isUser ? 4 : colors.radius,
              borderBottomLeftRadius: isUser ? colors.radius : 4,
            },
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: isUser ? colors.primaryForeground : colors.foreground },
            ]}
          >
            {item.content}
            {item.streaming && <Text style={{ color: colors.primary }}>▊</Text>}
          </Text>
        </View>
      </Animated.View>
    );
  }, [colors]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Director AI</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          Describe your vision
        </Text>
      </View>

      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <View
        style={[
          styles.inputArea,
          {
            paddingBottom: insets.bottom + 8,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius * 2,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Tell me about your product..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!input.trim() || isSending}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  input.trim() && !isSending ? colors.primary : colors.muted,
                borderRadius: colors.radius * 2,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Ionicons name="arrow-up" size={18} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  userRow: { justifyContent: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  inputArea: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1.5,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
