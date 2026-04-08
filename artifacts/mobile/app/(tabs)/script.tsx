import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT } from "./_layout";
import { useUGC, type Script, type Platform as SocialPlatform } from "@/context/UGCContext";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

const PLATFORMS: { id: SocialPlatform; label: string; emoji: string }[] = [
  { id: "tiktok", label: "TikTok", emoji: "🎵" },
  { id: "instagram", label: "Instagram", emoji: "📸" },
  { id: "youtube", label: "YouTube", emoji: "▶️" },
];

const AD_ANGLES = [
  { id: "us-vs-them" as const, label: "Us vs. Them", sub: "Beat the old way" },
  { id: "before-after" as const, label: "Before & After", sub: "Show the transformation" },
  { id: "social-proof" as const, label: "Social Proof", sub: "Everyone loves this" },
];

interface ScriptOption {
  hook: string;
  body: string;
  cta: string;
  platform: string;
  angle: string;
}

export default function ScriptScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    productName,
    productDescription,
    productImageUri,
    settings,
    updateSettings,
    selectedScript,
    setSelectedScript,
    setCreativeVision,
  } = useUGC();

  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<ScriptOption[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customHook, setCustomHook] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const generateScripts = useCallback(async () => {
    if (!productImageUri && !productName) {
      setError("Please upload a product first.");
      return;
    }
    setLoading(true);
    setError(null);
    setScripts([]);
    setSelectedIdx(null);

    try {
      const resp = await fetch(`${API_BASE}/ugc/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName || "this product",
          productDescription: productDescription || "",
          platform: settings.platform,
          angle: settings.angle,
          count: 5,
        }),
      });
      if (!resp.ok) throw new Error("Failed to generate scripts");
      const data = await resp.json() as { scripts: ScriptOption[] };
      setScripts(data.scripts ?? []);
    } catch {
      setError("Could not generate scripts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [productImageUri, productName, productDescription, settings.platform, settings.angle]);

  useEffect(() => {
    if (productImageUri || productName) {
      generateScripts();
    }
  }, []);

  const handleSelect = useCallback((idx: number) => {
    Haptics.selectionAsync();
    setSelectedIdx(idx);
    const s = scripts[idx];
    if (s) {
      setSelectedScript({ hook: s.hook, body: s.body, cta: s.cta, platform: s.platform });
      setCreativeVision(`Hook: ${s.hook}\n\nScript: ${s.body}\n\nCTA: ${s.cta}`);
    }
  }, [scripts, setSelectedScript, setCreativeVision]);

  const handleCustom = useCallback(() => {
    if (!customHook.trim()) return;
    setSelectedScript({ hook: customHook.trim(), body: "", cta: "", platform: settings.platform });
    setCreativeVision(customHook.trim());
    setSelectedIdx(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [customHook, settings.platform, setSelectedScript, setCreativeVision]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/avatar");
  }, []);

  const handleSkip = useCallback(() => {
    setSelectedScript(null);
    router.push("/(tabs)/avatar");
  }, [setSelectedScript]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text style={[styles.title, { color: colors.foreground }]}>Script & Hooks</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            AI-generated scroll-stopping hooks. Pick one or write your own.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.row}>
          {PLATFORMS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => { Haptics.selectionAsync(); updateSettings({ platform: p.id }); }}
              style={[
                styles.platformChip,
                {
                  backgroundColor: settings.platform === p.id ? colors.primary : colors.card,
                  borderColor: settings.platform === p.id ? colors.primary : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={styles.platformEmoji}>{p.emoji}</Text>
              <Text style={[styles.platformLabel, { color: settings.platform === p.id ? colors.primaryForeground : colors.foreground }]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.row}>
          {AD_ANGLES.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => { Haptics.selectionAsync(); updateSettings({ angle: a.id }); }}
              style={[
                styles.angleChip,
                {
                  backgroundColor: settings.angle === a.id ? colors.primary : colors.card,
                  borderColor: settings.angle === a.id ? colors.primary : colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.angleLabel, { color: settings.angle === a.id ? colors.primaryForeground : colors.foreground }]}>
                {a.label}
              </Text>
              <Text style={[styles.angleSub, { color: settings.angle === a.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                {a.sub}
              </Text>
            </Pressable>
          ))}
        </Animated.View>

        <Pressable
          onPress={() => { generateScripts(); }}
          style={[styles.regenBtn, { borderColor: colors.primary, borderRadius: colors.radius }]}
        >
          <Ionicons name="refresh" size={15} color={colors.primary} />
          <Text style={[styles.regenText, { color: colors.primary }]}>Generate new scripts</Text>
        </Pressable>

        {error && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.errorBanner, { backgroundColor: "#FEF2F2", borderRadius: colors.radius }]}>
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}

        {loading && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Writing scroll-stopping scripts...
            </Text>
          </Animated.View>
        )}

        {!loading && scripts.map((s, idx) => (
          <Animated.View key={idx} entering={FadeInDown.delay(idx * 60).duration(400)}>
            <Pressable
              onPress={() => handleSelect(idx)}
              style={[
                styles.scriptCard,
                {
                  backgroundColor: colors.card,
                  borderColor: selectedIdx === idx ? colors.primary : colors.border,
                  borderRadius: colors.radius * 1.5,
                  borderWidth: selectedIdx === idx ? 2 : 1,
                },
              ]}
            >
              {selectedIdx === idx && (
                <View style={[styles.selectedBadge, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                  <Text style={styles.selectedBadgeText}>Selected</Text>
                </View>
              )}
              <View style={[styles.hookRow, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
                <Text style={[styles.hookLabel, { color: colors.primary }]}>HOOK</Text>
                <Text style={[styles.hookText, { color: colors.foreground }]}>{s.hook}</Text>
              </View>
              {s.body ? (
                <View style={styles.scriptSection}>
                  <Text style={[styles.scriptSectionLabel, { color: colors.mutedForeground }]}>SCRIPT</Text>
                  <Text style={[styles.scriptBody, { color: colors.foreground }]}>{s.body}</Text>
                </View>
              ) : null}
              {s.cta ? (
                <View style={styles.scriptSection}>
                  <Text style={[styles.scriptSectionLabel, { color: colors.mutedForeground }]}>CTA</Text>
                  <Text style={[styles.scriptCta, { color: colors.accent }]}>{s.cta}</Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ))}

        <Pressable
          onPress={() => setShowCustom((v) => !v)}
          style={[styles.customToggle, { borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <Ionicons name={showCustom ? "chevron-up" : "create-outline"} size={16} color={colors.primary} />
          <Text style={[styles.customToggleText, { color: colors.primary }]}>Write your own hook</Text>
        </Pressable>

        {showCustom && (
          <Animated.View entering={FadeInDown.duration(300)}>
            <TextInput
              style={[styles.customInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              value={customHook}
              onChangeText={setCustomHook}
              placeholder="Write your own hook or script..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Pressable
              onPress={handleCustom}
              style={[styles.customBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
            >
              <Text style={[styles.customBtnText, { color: colors.primary }]}>Use this hook</Text>
            </Pressable>
          </Animated.View>
        )}

        <View style={styles.navRow}>
          <Pressable
            onPress={handleSkip}
            style={[styles.skipBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip</Text>
          </Pressable>
          <Pressable
            onPress={handleNext}
            style={[styles.nextBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Text style={[styles.nextText, { color: colors.primaryForeground }]}>Next: Avatar</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 20 },
  row: { flexDirection: "row", gap: 8 },
  platformChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderWidth: 1 },
  platformEmoji: { fontSize: 16 },
  platformLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  angleChip: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, alignItems: "center" },
  angleLabel: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  angleSub: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 2 },
  regenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderWidth: 1 },
  regenText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorBanner: { padding: 12 },
  errorText: { color: "#DC2626", fontSize: 14, fontFamily: "Inter_400Regular" },
  loadingBox: { alignItems: "center", gap: 12, paddingVertical: 32 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  scriptCard: { padding: 16, gap: 12 },
  selectedBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4 },
  selectedBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  hookRow: { padding: 12, gap: 4 },
  hookLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  hookText: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 22 },
  scriptSection: { gap: 4 },
  scriptSectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  scriptBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  scriptCta: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  customToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderWidth: 1 },
  customToggleText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  customInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80 },
  customBtn: { marginTop: 8, paddingVertical: 12, alignItems: "center", borderRadius: 12 },
  customBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  navRow: { flexDirection: "row", gap: 12 },
  skipBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  skipText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nextBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  nextText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
