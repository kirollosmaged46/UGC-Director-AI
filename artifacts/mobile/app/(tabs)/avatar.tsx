import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
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
  type AvatarGender,
  type AvatarStyle,
  type AvatarLanguage,
} from "@/context/UGCContext";

const GENDERS: { id: AvatarGender; label: string; icon: string }[] = [
  { id: "female", label: "Female", icon: "👩" },
  { id: "male", label: "Male", icon: "👨" },
];

const ETHNICITIES = [
  { id: "diverse", label: "Diverse" },
  { id: "caucasian", label: "Caucasian" },
  { id: "black", label: "Black" },
  { id: "latina", label: "Latina/o" },
  { id: "asian", label: "Asian" },
  { id: "arab", label: "Arab" },
  { id: "south-asian", label: "South Asian" },
];

const STYLES: { id: AvatarStyle; label: string; desc: string; emoji: string }[] = [
  { id: "casual", label: "Casual", desc: "Everyday real-person look", emoji: "👕" },
  { id: "professional", label: "Professional", desc: "Clean & put-together", emoji: "👔" },
  { id: "streetwear", label: "Streetwear", desc: "Urban, Gen Z energy", emoji: "🧢" },
  { id: "sporty", label: "Sporty", desc: "Active & lifestyle", emoji: "🏃" },
];

const LANGUAGES: { id: AvatarLanguage; label: string; flag: string }[] = [
  { id: "english", label: "English", flag: "🇺🇸" },
  { id: "arabic", label: "Arabic", flag: "🇸🇦" },
  { id: "spanish", label: "Spanish", flag: "🇪🇸" },
  { id: "french", label: "French", flag: "🇫🇷" },
  { id: "german", label: "German", flag: "🇩🇪" },
  { id: "portuguese", label: "Portuguese", flag: "🇧🇷" },
  { id: "hindi", label: "Hindi", flag: "🇮🇳" },
  { id: "chinese", label: "Chinese", flag: "🇨🇳" },
];

function SelectChip({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
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
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function AvatarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { avatar, updateAvatar } = useUGC();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const pick = useCallback(<K extends keyof typeof avatar>(key: K, value: typeof avatar[K]) => {
    Haptics.selectionAsync();
    updateAvatar({ [key]: value } as Partial<typeof avatar>);
  }, [updateAvatar]);

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateAvatar({ enabled: !avatar.enabled });
  }, [avatar.enabled, updateAvatar]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/director");
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text style={[styles.title, { color: colors.foreground }]}>Avatar</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Choose a creator avatar or go lifestyle-only
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <Pressable
            onPress={handleToggle}
            style={[
              styles.toggleCard,
              {
                backgroundColor: avatar.enabled ? colors.primary : colors.card,
                borderColor: avatar.enabled ? colors.primary : colors.border,
                borderRadius: colors.radius * 1.5,
              },
            ]}
          >
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleEmoji}>🎭</Text>
              <View>
                <Text style={[styles.toggleTitle, { color: avatar.enabled ? "#fff" : colors.foreground }]}>
                  Include Avatar Creator
                </Text>
                <Text style={[styles.toggleSub, { color: avatar.enabled ? "rgba(255,255,255,0.75)" : colors.mutedForeground }]}>
                  A realistic person holds & presents your product
                </Text>
              </View>
            </View>
            <View style={[styles.toggleSwitch, { backgroundColor: avatar.enabled ? "#fff" : colors.border }]}>
              {avatar.enabled && <Ionicons name="checkmark" size={16} color={colors.primary} />}
            </View>
          </Pressable>

          <Pressable
            onPress={() => { if (avatar.enabled) handleToggle(); }}
            style={[
              styles.noAvatarCard,
              {
                backgroundColor: !avatar.enabled ? colors.secondary : colors.card,
                borderColor: !avatar.enabled ? colors.primary : colors.border,
                borderRadius: colors.radius * 1.5,
                marginTop: 10,
              },
            ]}
          >
            <Text style={styles.toggleEmoji}>🛍️</Text>
            <View>
              <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Lifestyle Only</Text>
              <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
                Product in authentic real-world scenes — no person
              </Text>
            </View>
          </Pressable>
        </Animated.View>

        {avatar.enabled && (
          <>
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GENDER</Text>
              <View style={styles.row}>
                {GENDERS.map((g) => (
                  <SelectChip key={g.id} selected={avatar.gender === g.id} onPress={() => pick("gender", g.id)}>
                    <Text style={styles.chipEmoji}>{g.icon}</Text>
                    <Text style={[styles.chipLabel, { color: avatar.gender === g.id ? colors.primaryForeground : colors.foreground }]}>
                      {g.label}
                    </Text>
                  </SelectChip>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(130).duration(400)} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ETHNICITY</Text>
              <View style={styles.wrapRow}>
                {ETHNICITIES.map((e) => (
                  <SelectChip key={e.id} selected={avatar.ethnicity === e.id} onPress={() => pick("ethnicity", e.id)}>
                    <Text style={[styles.chipLabel, { color: avatar.ethnicity === e.id ? colors.primaryForeground : colors.foreground }]}>
                      {e.label}
                    </Text>
                  </SelectChip>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STYLE</Text>
              <View style={styles.wrapRow}>
                {STYLES.map((s) => (
                  <SelectChip key={s.id} selected={avatar.style === s.id} onPress={() => pick("style", s.id)}>
                    <Text style={styles.chipEmoji}>{s.emoji}</Text>
                    <View>
                      <Text style={[styles.chipLabel, { color: avatar.style === s.id ? colors.primaryForeground : colors.foreground }]}>
                        {s.label}
                      </Text>
                      <Text style={[styles.chipSub, { color: avatar.style === s.id ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                        {s.desc}
                      </Text>
                    </View>
                  </SelectChip>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(190).duration(400)} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LANGUAGE</Text>
              <View style={styles.wrapRow}>
                {LANGUAGES.map((l) => (
                  <SelectChip key={l.id} selected={avatar.language === l.id} onPress={() => pick("language", l.id)}>
                    <Text style={styles.chipEmoji}>{l.flag}</Text>
                    <Text style={[styles.chipLabel, { color: avatar.language === l.id ? colors.primaryForeground : colors.foreground }]}>
                      {l.label}
                    </Text>
                  </SelectChip>
                ))}
              </View>
            </Animated.View>
          </>
        )}

        <Animated.View entering={FadeInDown.delay(220).duration(400)}>
          <Pressable
            onPress={handleNext}
            style={[styles.nextBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Text style={[styles.nextText, { color: colors.primaryForeground }]}>Next: Direction</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 20 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  row: { flexDirection: "row", gap: 10 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggleCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderWidth: 2 },
  noAvatarCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1.5 },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  toggleEmoji: { fontSize: 28 },
  toggleTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  toggleSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  toggleSwitch: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1.5 },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chipSub: { fontSize: 10, fontFamily: "Inter_400Regular" },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  nextText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
