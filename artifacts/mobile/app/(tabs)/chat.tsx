import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { fetch } from "expo/fetch";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT } from "./_layout";
import { useUGC } from "@/context/UGCContext";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  referenceUri?: string;
  streaming?: boolean;
}

const SYSTEM_INTRO = "I'm your AI creative director. Tell me about your product — what it is, who it's for, and the vibe you're going for. You can also share a reference image or UGC you love, and I'll extract the style for you.";

async function uriToBase64(uri: string): Promise<{ b64: string; mime: string }> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    const mime = blob.type || "image/jpeg";
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({ b64: result.split(",")[1] ?? "", mime });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const lowerUri = uri.toLowerCase();
  const mime = lowerUri.endsWith(".png") ? "image/png" : lowerUri.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  return { b64, mime };
}

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
  const [referenceUri, setReferenceUri] = useState<string | null>(null);
  const [referenceIsVideo, setReferenceIsVideo] = useState(false);
  const [referenceThumbnailUri, setReferenceThumbnailUri] = useState<string | null>(null);
  const [isPickingRef, setIsPickingRef] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
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

  const pickMedia = useCallback(async (mediaTypes: ImagePicker.MediaType[]) => {
    try {
      setIsPickingRef(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo & video library access to share a reference.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        quality: 0.8,
        allowsEditing: false,
        videoMaxDuration: 120,
      });
      setShowAttachMenu(false);
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const isVideo = asset.type === "video";
        setReferenceUri(asset.uri);
        setReferenceIsVideo(isVideo);
        if (isVideo) {
          try {
            const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 });
            setReferenceThumbnailUri(thumbUri);
          } catch {
            setReferenceThumbnailUri(null);
          }
        } else {
          setReferenceThumbnailUri(null);
        }
        Haptics.selectionAsync();
      }
    } catch {
      Alert.alert("Error", "Could not pick reference media.");
    } finally {
      setIsPickingRef(false);
    }
  }, []);

  const pickReference = useCallback(() => {
    if (Platform.OS === "web") {
      setShowAttachMenu((prev) => !prev);
    } else {
      Alert.alert(
        "Add Reference",
        "Choose what type of reference to attach",
        [
          { text: "Photo", onPress: () => pickMedia(["images"]) },
          { text: "Video", onPress: () => pickMedia(["videos"]) },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
    }
  }, [pickMedia]);

  const clearReference = useCallback(() => {
    setReferenceUri(null);
    setReferenceIsVideo(false);
    setReferenceThumbnailUri(null);
    Haptics.selectionAsync();
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isSending) return;

    const userText = input.trim();
    const sendRef = referenceUri;
    const sendIsVideo = referenceIsVideo;
    const sendThumb = referenceThumbnailUri;
    setInput("");
    setReferenceUri(null);
    setReferenceIsVideo(false);
    setReferenceThumbnailUri(null);
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      id: Date.now().toString() + "u",
      role: "user",
      content: userText,
      referenceUri: sendIsVideo ? (sendThumb ?? sendRef ?? undefined) : (sendRef ?? undefined),
    };
    setMessages((prev) => [userMsg, ...prev]);

    let convId = conversationId;
    try {
      if (!convId) {
        convId = await createConversation();
        setConversationId(convId);
      }

      let refB64: string | undefined;
      let refMime: string | undefined;
      const refSourceUri = sendIsVideo ? (sendThumb ?? sendRef) : sendRef;
      if (refSourceUri) {
        try {
          const { b64, mime } = await uriToBase64(refSourceUri);
          refB64 = b64;
          refMime = mime;
        } catch {
          refB64 = undefined;
        }
      }

      const streamingId = Date.now().toString() + "a";
      let accumulated = "";

      const response = await fetch(`${baseUrl}/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userText,
          referenceImageBase64: refB64,
          referenceImageMime: refMime,
        }),
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
    } catch {
      Alert.alert("Error", "Failed to get response. Please try again.");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, referenceUri, conversationId, createConversation, setConversationId, setCreativeVision, baseUrl]);

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
        <View style={[styles.msgColumn, isUser ? styles.msgColumnUser : styles.msgColumnAi]}>
          {item.referenceUri && (
            <Image
              source={{ uri: item.referenceUri }}
              style={[styles.referenceThumb, { borderRadius: colors.radius }]}
              resizeMode="cover"
            />
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
          Describe your vision or share a reference
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
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 8,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        {referenceUri && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.refPreviewRow}>
            <View style={{ position: "relative" }}>
              <Image
                source={{ uri: referenceThumbnailUri ?? referenceUri }}
                style={[styles.refPreview, { borderRadius: colors.radius }]}
                resizeMode="cover"
              />
              {referenceIsVideo && (
                <View style={[styles.videoBadge, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
                  <Ionicons name="play" size={10} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.refPreviewLabel, { color: colors.foreground }]}>
                {referenceIsVideo ? "Video reference attached" : "Reference attached"}
              </Text>
              <Text style={[styles.refPreviewSub, { color: colors.mutedForeground }]}>
                {referenceIsVideo ? "AI will analyze a frame from this video" : "AI will analyze this image"}
              </Text>
            </View>
            <Pressable onPress={clearReference} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
            </Pressable>
          </Animated.View>
        )}

        {showAttachMenu && Platform.OS === "web" && (
          <Animated.View entering={FadeIn.duration(150)} style={[styles.attachMenu, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Pressable
              style={[styles.attachMenuItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              onPress={() => { pickMedia(["images"]); }}
            >
              <Ionicons name="image-outline" size={18} color={colors.foreground} />
              <Text style={[styles.attachMenuText, { color: colors.foreground }]}>Photo</Text>
            </Pressable>
            <Pressable
              style={styles.attachMenuItem}
              onPress={() => { pickMedia(["videos"]); }}
            >
              <Ionicons name="videocam-outline" size={18} color={colors.foreground} />
              <Text style={[styles.attachMenuText, { color: colors.foreground }]}>Video</Text>
            </Pressable>
          </Animated.View>
        )}

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
          <Pressable
            onPress={pickReference}
            disabled={isPickingRef || isSending}
            style={[styles.attachBtn, { opacity: isPickingRef ? 0.5 : 1 }]}
            hitSlop={8}
          >
            {isPickingRef ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <View style={styles.attachBtnInner}>
                <Ionicons
                  name={referenceIsVideo ? "videocam" : referenceUri ? "image" : "attach-outline"}
                  size={22}
                  color={referenceUri ? colors.primary : colors.mutedForeground}
                />
                {!referenceUri && (
                  <Text style={[styles.attachHint, { color: colors.mutedForeground }]}>
                    Photo{"\n"}/ Video
                  </Text>
                )}
              </View>
            )}
          </Pressable>
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
  msgColumn: { gap: 4, maxWidth: "80%" },
  msgColumnUser: { alignItems: "flex-end" },
  msgColumnAi: { alignItems: "flex-start" },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  referenceThumb: {
    width: 160,
    height: 120,
  },
  bubble: { paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  inputArea: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, gap: 8 },
  refPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  refPreview: {
    width: 48,
    height: 48,
  },
  videoBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  refPreviewLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  refPreviewSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1.5,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
  },
  attachBtn: {
    width: 46,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  attachHint: {
    fontSize: 7,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 9,
  },
  attachMenu: {
    borderWidth: 1,
    overflow: "hidden",
    alignSelf: "flex-start",
    minWidth: 130,
  },
  attachMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  attachMenuText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
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
