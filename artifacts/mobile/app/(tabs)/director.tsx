import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT } from "./_layout";
import {
  useUGC,
  type AdAngle,
  type LightingMood,
  type AspectRatio,
  type Platform as SocialPlatform,
  type ContentType,
  type FashionStyle,
} from "@/context/UGCContext";

type IonicIcon = React.ComponentProps<typeof Ionicons>["name"];

const AD_ANGLES: { id: AdAngle; label: string; tagline: string; icon: IonicIcon; desc: string; suggestions: string[] }[] = [
  {
    id: "us-vs-them",
    label: "Us vs. Them",
    tagline: "Make the choice obvious",
    icon: "swap-horizontal-outline",
    desc: "Creator tried the old way — then found this. The contrast is undeniable.",
    suggestions: [
      "I spent 2 years trying everything — nothing worked until this",
      "Stop wasting money on [old way]. This is what actually works",
      "Every other option had the same problem. Then I found this",
    ],
  },
  {
    id: "before-after",
    label: "Before & After",
    tagline: "Show the transformation",
    icon: "trending-up-outline",
    desc: "Real before moment, real after result. Emotion carries the story.",
    suggestions: [
      "6 months ago I was [problem]. This is what changed everything",
      "Not gonna lie, I didn't believe it would actually work",
      "The before vs after honestly shocked me",
    ],
  },
  {
    id: "social-proof",
    label: "Social Proof",
    tagline: "Everyone's already using it",
    icon: "people-outline",
    desc: "Unboxing or mid-use discovery. Genuine surprise, lived-in setting.",
    suggestions: [
      "My whole friend group has this now and I finally understand why",
      "I ordered this on a whim and I can't stop talking about it",
      "POV: you finally try the thing everyone's been telling you to get",
    ],
  },
];

const LIGHTING: { id: LightingMood; label: string; color: string; desc: string; emoji: string }[] = [
  { id: "golden-hour", label: "Golden Hour", color: "#F59E0B", desc: "Warm & cinematic", emoji: "🌅" },
  { id: "studio-white", label: "Studio", color: "#CBD5E1", desc: "Clean & crisp", emoji: "💡" },
  { id: "moody-dark", label: "Moody Dark", color: "#475569", desc: "Dramatic shadows", emoji: "🌑" },
  { id: "outdoor-natural", label: "Natural", color: "#86EFAC", desc: "Fresh & bright", emoji: "☀️" },
  { id: "neon", label: "Neon", color: "#A855F7", desc: "Nightlife energy", emoji: "🌆" },
];

const RATIOS: { id: AspectRatio; label: string; desc: string; icon: string }[] = [
  { id: "9:16", label: "9:16", desc: "TikTok / Reels", icon: "📱" },
  { id: "1:1", label: "1:1", desc: "Square", icon: "⬜" },
  { id: "4:5", label: "4:5", desc: "Instagram Feed", icon: "🖼️" },
  { id: "16:9", label: "16:9", desc: "YouTube", icon: "🖥️" },
];

const CONTENT_TYPES: { id: ContentType; label: string; icon: IonicIcon; desc: string }[] = [
  { id: "photo", label: "Photos", icon: "image-outline", desc: "Still images" },
  { id: "video", label: "Video", icon: "film-outline", desc: "Real mp4" },
  { id: "both", label: "Both", icon: "layers-outline", desc: "Photos + Video" },
];

const COUNT_OPTIONS = [1, 2, 3];
const DURATION_OPTIONS = [10, 15, 20, 30];

const FASHION_STYLES: { id: FashionStyle; label: string; emoji: string; desc: string }[] = [
  { id: "ootd",         label: "OOTD",         emoji: "👗", desc: "Outfit of the Day — full body, lifestyle context" },
  { id: "try-on",       label: "Try-On",        emoji: "🪞", desc: "Wearing the item, movement & fit focus" },
  { id: "flat-lay",     label: "Flat Lay",      emoji: "📐", desc: "Overhead product arrangement, editorial" },
  { id: "styling-tips", label: "Styling Tips",  emoji: "✨", desc: "How-to, educational creator energy" },
  { id: "haul",         label: "Haul",          emoji: "🛍️", desc: "Multiple items, unboxing energy" },
  { id: "mirror-selfie",label: "Mirror Selfie", emoji: "📱", desc: "Authentic POV, low-effort real feel" },
];

function OptionChip({
  selected,
  onPress,
  children,
  style,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function DirectorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, productImageUri, triggerGenerate, triggerGenerateAllAngles, setCurrentResult } = useUGC();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const pick = useCallback(
    <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
      Haptics.selectionAsync();
      updateSettings({ [key]: value } as Partial<typeof settings>);
    },
    [updateSettings]
  );

  const handleGenerate = useCallback(() => {
    if (!productImageUri) {
      router.push("/(tabs)/index");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentResult(null);
    triggerGenerate();
    router.push("/(tabs)/generate");
  }, [productImageUri, triggerGenerate, setCurrentResult]);

  const handleGenerateAllAngles = useCallback(() => {
    if (!productImageUri) {
      router.push("/(tabs)/index");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setCurrentResult(null);
    triggerGenerateAllAngles();
    router.push("/(tabs)/generate");
  }, [productImageUri, triggerGenerateAllAngles, setCurrentResult]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Direction</Text>
          <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
            Set the creative parameters for your content
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OUTPUT TYPE</Text>
          <View style={styles.row}>
            {CONTENT_TYPES.map((t) => (
              <OptionChip key={t.id} selected={settings.contentType === t.id} onPress={() => pick("contentType", t.id)} style={styles.flex1}>
                <Ionicons name={t.icon} size={16} color={settings.contentType === t.id ? colors.primaryForeground : colors.foreground} />
                <Text style={[styles.chipLabel, { color: settings.contentType === t.id ? colors.primaryForeground : colors.foreground }]}>
                  {t.label}
                </Text>
                <Text style={[styles.chipSub, { color: settings.contentType === t.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                  {t.desc}
                </Text>
              </OptionChip>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AD ANGLE</Text>
          {AD_ANGLES.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => pick("angle", a.id)}
              style={[
                styles.angleCard,
                {
                  backgroundColor: settings.angle === a.id ? colors.primary : colors.card,
                  borderColor: settings.angle === a.id ? colors.primary : colors.border,
                  borderRadius: colors.radius * 1.5,
                  borderWidth: settings.angle === a.id ? 2 : 1,
                },
              ]}
            >
              <View style={styles.angleHeader}>
                <View style={[styles.angleIconBox, { backgroundColor: settings.angle === a.id ? "rgba(255,255,255,0.2)" : colors.secondary }]}>
                  <Ionicons name={a.icon} size={18} color={settings.angle === a.id ? "#fff" : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.angleLabel, { color: settings.angle === a.id ? "#fff" : colors.foreground }]}>{a.label}</Text>
                  <Text style={[styles.angleTagline, { color: settings.angle === a.id ? "rgba(255,255,255,0.75)" : colors.mutedForeground }]}>
                    {a.tagline}
                  </Text>
                </View>
                {settings.angle === a.id && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
              </View>
              <Text style={[styles.angleDesc, { color: settings.angle === a.id ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>
                {a.desc}
              </Text>
              <View style={styles.suggestionList}>
                {a.suggestions.map((s, si) => (
                  <View
                    key={si}
                    style={[
                      styles.suggestionPill,
                      {
                        backgroundColor: settings.angle === a.id ? "rgba(255,255,255,0.15)" : colors.secondary,
                        borderColor: settings.angle === a.id ? "rgba(255,255,255,0.3)" : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.suggestionIcon, { color: settings.angle === a.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                      {si === 0 ? "🎯" : si === 1 ? "🔥" : "💬"}
                    </Text>
                    <Text style={[styles.suggestionText, { color: settings.angle === a.id ? "rgba(255,255,255,0.85)" : colors.foreground }]}>
                      "{s}"
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIGHTING MOOD</Text>
          <View style={styles.lightingRow}>
            {LIGHTING.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => pick("lighting", l.id)}
                style={[
                  styles.lightingChip,
                  {
                    backgroundColor: settings.lighting === l.id ? colors.primary : colors.card,
                    borderColor: settings.lighting === l.id ? colors.primary : colors.border,
                    borderRadius: colors.radius,
                    borderWidth: settings.lighting === l.id ? 2 : 1,
                  },
                ]}
              >
                <Text style={styles.lightingEmoji}>{l.emoji}</Text>
                <View style={[styles.lightingDot, { backgroundColor: l.color }]} />
                <Text style={[styles.lightingLabel, { color: settings.lighting === l.id ? colors.primaryForeground : colors.foreground }]}>
                  {l.label}
                </Text>
                <Text style={[styles.lightingSub, { color: settings.lighting === l.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                  {l.desc}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(400)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FORMAT</Text>
          <View style={styles.row}>
            {RATIOS.map((r) => (
              <OptionChip key={r.id} selected={settings.aspectRatio === r.id} onPress={() => pick("aspectRatio", r.id)} style={styles.flex1}>
                <Text style={styles.ratioIcon}>{r.icon}</Text>
                <Text style={[styles.ratioLabel, { color: settings.aspectRatio === r.id ? colors.primaryForeground : colors.foreground }]}>
                  {r.label}
                </Text>
                <Text style={[styles.chipSub, { color: settings.aspectRatio === r.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                  {r.desc}
                </Text>
              </OptionChip>
            ))}
          </View>
        </Animated.View>

        {settings.contentType !== "video" && (
          <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NUMBER OF IMAGES</Text>
            <View style={styles.countRow}>
              {COUNT_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => { Haptics.selectionAsync(); updateSettings({ count: c }); }}
                  style={[
                    styles.countChip,
                    {
                      backgroundColor: settings.count === c ? colors.primary : colors.card,
                      borderColor: settings.count === c ? colors.primary : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Text style={[styles.countLabel, { color: settings.count === c ? colors.primaryForeground : colors.foreground }]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {settings.contentType !== "photo" && (
          <Animated.View entering={FadeInDown.delay(170).duration(400)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VIDEO DURATION</Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => { Haptics.selectionAsync(); updateSettings({ videoDuration: d }); }}
                  style={[
                    styles.durationChip,
                    {
                      backgroundColor: settings.videoDuration === d ? colors.primary : colors.card,
                      borderColor: settings.videoDuration === d ? colors.primary : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Text style={[styles.durationNum, { color: settings.videoDuration === d ? colors.primaryForeground : colors.foreground }]}>
                    {d}s
                  </Text>
                  <Text style={[styles.durationSub, { color: settings.videoDuration === d ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                    {d <= 10 ? "Short" : d <= 15 ? "Standard" : d <= 20 ? "Extended" : "Long"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(175).duration(400)} style={styles.section}>
          <View style={styles.fashionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FASHION & STYLE</Text>
            {settings.fashionStyle && (
              <Pressable onPress={() => { Haptics.selectionAsync(); updateSettings({ fashionStyle: null }); }}>
                <Text style={[styles.clearLabel, { color: colors.primary }]}>Clear</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.fashionGrid}>
            {FASHION_STYLES.map((f) => {
              const selected = settings.fashionStyle === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => { Haptics.selectionAsync(); updateSettings({ fashionStyle: selected ? null : f.id }); }}
                  style={[
                    styles.fashionCard,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderRadius: colors.radius,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  <Text style={styles.fashionEmoji}>{f.emoji}</Text>
                  <Text style={[styles.fashionLabel, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                    {f.label}
                  </Text>
                  <Text style={[styles.fashionDesc, { color: selected ? "rgba(255,255,255,0.65)" : colors.mutedForeground }]}>
                    {f.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(400)} style={styles.generateSection}>
          <Pressable
            style={[styles.generateBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={handleGenerate}
          >
            <MaterialCommunityIcons name="creation" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>Generate Now</Text>
          </Pressable>

          <Pressable
            style={[styles.allAnglesBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
            onPress={handleGenerateAllAngles}
          >
            <Ionicons name="layers-outline" size={18} color={colors.primary} />
            <Text style={[styles.allAnglesBtnText, { color: colors.primary }]}>Generate All 3 Angles</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },
  screenTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  screenSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 20 },
  section: { gap: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  row: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  chip: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", gap: 4, borderWidth: 1.5 },
  chipLabel: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  chipSub: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  angleCard: { padding: 14, gap: 8 },
  angleHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  angleIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  angleLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  angleTagline: { fontSize: 12, fontFamily: "Inter_400Regular" },
  angleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  lightingRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lightingChip: { width: "30%", paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", gap: 4 },
  lightingEmoji: { fontSize: 22 },
  lightingDot: { width: 8, height: 8, borderRadius: 4 },
  lightingLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
  lightingSub: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  ratioIcon: { fontSize: 18 },
  ratioLabel: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  countRow: { flexDirection: "row", gap: 10 },
  countChip: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  countLabel: { fontSize: 20, fontFamily: "Inter_700Bold" },
  durationRow: { flexDirection: "row", gap: 8 },
  durationChip: { flex: 1, paddingVertical: 12, alignItems: "center", borderWidth: 1.5, gap: 2 },
  durationNum: { fontSize: 17, fontFamily: "Inter_700Bold" },
  durationSub: { fontSize: 9, fontFamily: "Inter_400Regular" },
  fashionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clearLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fashionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fashionCard: { width: "47%", padding: 12, gap: 4, borderWidth: 1 },
  fashionEmoji: { fontSize: 22 },
  fashionLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fashionDesc: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  suggestionList: { gap: 6, marginTop: 4 },
  suggestionPill: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
  suggestionIcon: { fontSize: 11, lineHeight: 16, minWidth: 14 },
  suggestionText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, fontStyle: "italic" },
  generateSection: { gap: 10 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 56 },
  generateBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  allAnglesBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48 },
  allAnglesBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
