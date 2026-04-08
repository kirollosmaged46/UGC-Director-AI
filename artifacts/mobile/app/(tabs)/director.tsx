import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import {
  useUGC,
  type AdAngle,
  type LightingMood,
  type AspectRatio,
  type Platform as SocialPlatform,
  type ContentType,
} from "@/context/UGCContext";

type IonicIcon = React.ComponentProps<typeof Ionicons>["name"];

const AD_ANGLES: { id: AdAngle; label: string; tagline: string; icon: IonicIcon }[] = [
  {
    id: "us-vs-them",
    label: "Us vs. Them",
    tagline: "Make the choice obvious",
    icon: "swap-horizontal-outline",
  },
  {
    id: "before-after",
    label: "Before & After",
    tagline: "Show the transformation",
    icon: "trending-up-outline",
  },
  {
    id: "social-proof",
    label: "Social Proof",
    tagline: "Everyone's already using it",
    icon: "people-outline",
  },
];

const LIGHTING: { id: LightingMood; label: string; color: string; desc: string }[] = [
  { id: "golden-hour", label: "Golden Hour", color: "#F59E0B", desc: "Warm & cinematic" },
  { id: "studio-white", label: "Studio", color: "#E2E8F0", desc: "Clean & crisp" },
  { id: "moody-dark", label: "Moody Dark", color: "#1E293B", desc: "Dramatic shadows" },
  { id: "outdoor-natural", label: "Natural", color: "#86EFAC", desc: "Fresh & bright" },
  { id: "neon", label: "Neon", color: "#A855F7", desc: "Nightlife energy" },
];

const RATIOS: { id: AspectRatio; label: string; desc: string }[] = [
  { id: "9:16", label: "9:16", desc: "TikTok / Reels" },
  { id: "1:1", label: "1:1", desc: "Square" },
  { id: "4:5", label: "4:5", desc: "Instagram" },
  { id: "16:9", label: "16:9", desc: "YouTube" },
];

const PLATFORMS: { id: SocialPlatform; label: string; icon: IonicIcon }[] = [
  { id: "tiktok", label: "TikTok", icon: "logo-tiktok" },
  { id: "instagram", label: "Instagram", icon: "logo-instagram" },
  { id: "youtube", label: "YouTube", icon: "logo-youtube" },
];

const CONTENT_TYPES: { id: ContentType; label: string; icon: IonicIcon; desc: string }[] = [
  { id: "photo", label: "Photos", icon: "image-outline", desc: "Still images" },
  { id: "video", label: "Video", icon: "film-outline", desc: "Real mp4" },
  { id: "both", label: "Both", icon: "layers-outline", desc: "Photos + Video" },
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
          backgroundColor: selected ? colors.primary : colors.secondary,
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

  const handleGenerate = useCallback(() => {
    if (!productImageUri) {
      Alert.alert("No Product", "Please upload a product image first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentResult(null);
    triggerGenerate();
    router.push("/(tabs)/generate");
  }, [productImageUri, triggerGenerate, setCurrentResult]);

  const handleGenerateAllAngles = useCallback(() => {
    if (!productImageUri) {
      Alert.alert("No Product", "Please upload a product image first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setCurrentResult(null);
    triggerGenerateAllAngles();
    router.push("/(tabs)/generate");
  }, [productImageUri, triggerGenerateAllAngles, setCurrentResult]);

  const pick = useCallback(
    <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
      Haptics.selectionAsync();
      const partial = {} as Partial<typeof settings>;
      partial[key] = value;
      updateSettings(partial);
    },
    [updateSettings]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Direction</Text>
        <Text style={[styles.screenSub, { color: colors.mutedForeground }]}>
          Set your creative parameters
        </Text>

        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PLATFORM</Text>
          <View style={styles.row}>
            {PLATFORMS.map((p) => (
              <OptionChip
                key={p.id}
                selected={settings.platform === p.id}
                onPress={() => pick("platform", p.id)}
                style={styles.platformChip}
              >
                <Ionicons
                  name={p.icon}
                  size={18}
                  color={settings.platform === p.id ? colors.primaryForeground : colors.foreground}
                />
                <Text
                  style={[
                    styles.chipLabel,
                    {
                      color:
                        settings.platform === p.id ? colors.primaryForeground : colors.foreground,
                    },
                  ]}
                >
                  {p.label}
                </Text>
              </OptionChip>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AD ANGLE</Text>
          <View style={styles.angleGrid}>
            {AD_ANGLES.map((a) => {
              const selected = settings.angle === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => pick("angle", a.id)}
                  style={[
                    styles.angleCard,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderRadius: colors.radius * 1.5,
                    },
                  ]}
                >
                  <View style={styles.angleCardTop}>
                    <Ionicons
                      name={a.icon}
                      size={22}
                      color={selected ? colors.primaryForeground : colors.primary}
                    />
                    {selected && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.primaryForeground} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.angleLabel,
                      { color: selected ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {a.label}
                  </Text>
                  <Text
                    style={[
                      styles.angleTagline,
                      { color: selected ? "rgba(255,255,255,0.75)" : colors.mutedForeground },
                    ]}
                  >
                    {a.tagline}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIGHTING MOOD</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
            <View style={styles.hRow}>
              {LIGHTING.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => pick("lighting", l.id)}
                  style={[
                    styles.lightingChip,
                    {
                      backgroundColor:
                        settings.lighting === l.id ? colors.primary : colors.card,
                      borderColor:
                        settings.lighting === l.id ? colors.primary : colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <View style={[styles.lightingDot, { backgroundColor: l.color }]} />
                  <Text
                    style={[
                      styles.lightingLabel,
                      {
                        color:
                          settings.lighting === l.id
                            ? colors.primaryForeground
                            : colors.foreground,
                      },
                    ]}
                  >
                    {l.label}
                  </Text>
                  <Text
                    style={[
                      styles.lightingDesc,
                      {
                        color:
                          settings.lighting === l.id
                            ? "rgba(255,255,255,0.7)"
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {l.desc}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ASPECT RATIO</Text>
          <View style={styles.row}>
            {RATIOS.map((r) => (
              <OptionChip
                key={r.id}
                selected={settings.aspectRatio === r.id}
                onPress={() => pick("aspectRatio", r.id)}
                style={styles.ratioChip}
              >
                <Text
                  style={[
                    styles.ratioLabel,
                    {
                      color:
                        settings.aspectRatio === r.id
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {r.label}
                </Text>
                <Text
                  style={[
                    styles.ratioDesc,
                    {
                      color:
                        settings.aspectRatio === r.id
                          ? "rgba(255,255,255,0.7)"
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {r.desc}
                </Text>
              </OptionChip>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OUTPUT TYPE</Text>
          <View style={styles.row}>
            {CONTENT_TYPES.map((ct) => (
              <OptionChip
                key={ct.id}
                selected={settings.contentType === ct.id}
                onPress={() => pick("contentType", ct.id)}
                style={styles.ctypeChip}
              >
                <Ionicons
                  name={ct.icon}
                  size={18}
                  color={settings.contentType === ct.id ? colors.primaryForeground : colors.primary}
                />
                <Text
                  style={[
                    styles.chipLabel,
                    {
                      color:
                        settings.contentType === ct.id ? colors.primaryForeground : colors.foreground,
                    },
                  ]}
                >
                  {ct.label}
                </Text>
              </OptionChip>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NUMBER OF OUTPUTS</Text>
          <View style={styles.row}>
            {[1, 2, 3].map((n) => (
              <OptionChip
                key={n}
                selected={settings.count === n}
                onPress={() => pick("count", n)}
                style={styles.countChip}
              >
                <Text
                  style={[
                    styles.countLabel,
                    {
                      color:
                        settings.count === n ? colors.primaryForeground : colors.foreground,
                    },
                  ]}
                >
                  {n}
                </Text>
              </OptionChip>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 8,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.footerRow}>
          <Pressable
            style={[
              styles.allAnglesBtn,
              { borderColor: colors.primary, borderRadius: colors.radius },
            ]}
            onPress={handleGenerateAllAngles}
          >
            <MaterialCommunityIcons name="compare" size={16} color={colors.primary} />
            <Text style={[styles.allAnglesBtnText, { color: colors.primary }]} numberOfLines={1}>
              All 3 Angles
            </Text>
          </Pressable>
          <Pressable
            style={[styles.generateBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={handleGenerate}
          >
            <MaterialCommunityIcons name="creation" size={18} color={colors.primaryForeground} />
            <Text style={[styles.generateBtnText, { color: colors.primaryForeground }]} numberOfLines={1}>
              Generate
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  screenSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  chipLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  platformChip: { flex: 1, justifyContent: "center" },
  angleGrid: { gap: 10 },
  angleCard: {
    borderWidth: 1.5,
    padding: 16,
    gap: 6,
  },
  angleCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  angleLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  angleTagline: { fontSize: 13, fontFamily: "Inter_400Regular" },
  hScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  hRow: { flexDirection: "row", gap: 10, paddingRight: 20 },
  lightingChip: {
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 130,
    gap: 6,
  },
  lightingDot: { width: 24, height: 8, borderRadius: 4 },
  lightingLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  lightingDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ratioChip: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    paddingVertical: 12,
  },
  ratioLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  ratioDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ctypeChip: { flex: 1, justifyContent: "center" },
  countChip: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  countLabel: { fontSize: 22, fontFamily: "Inter_700Bold" },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  generateBtn: {
    flex: 2,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generateBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  allAnglesBtn: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
  },
  allAnglesBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
