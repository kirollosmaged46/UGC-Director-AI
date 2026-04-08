import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  Platform,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT } from "./_layout";
import { useUGC } from "@/context/UGCContext";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { productImageUri, setProductImageUri, productName, setProductName, productDescription, setProductDescription } = useUGC();
  const [picking, setPicking] = useState(false);

  const pickImage = useCallback(async () => {
    try {
      setPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.85,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        setProductImageUri(result.assets[0].uri);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
    } finally {
      setPicking(false);
    }
  }, [setProductImageUri]);

  const takePhoto = useCallback(async () => {
    try {
      setPicking(true);
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        setProductImageUri(result.assets[0].uri);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
    } finally {
      setPicking(false);
    }
  }, [setProductImageUri]);

  const handleContinue = useCallback(() => {
    if (!productImageUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/script");
  }, [productImageUri]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View entering={FadeInDown.duration(600).springify()}>
        <View style={styles.headerRow}>
          <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="creation" size={20} color="#fff" />
          </View>
          <View>
            <Text style={[styles.headline, { color: colors.foreground }]}>UGC Studio</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Drop your product. Get scroll-stopping content.
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={[styles.stepLabel, { color: colors.primary }]}>STEP 1 — PRODUCT</Text>
      </Animated.View>

      {productImageUri ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.previewContainer}>
          <Pressable onPress={pickImage} style={styles.previewWrapper}>
            <Image source={{ uri: productImageUri }} style={[styles.previewImage, { borderRadius: colors.radius * 1.5 }]} />
            <View style={[styles.changeOverlay, { borderRadius: colors.radius }]}>
              <Ionicons name="camera-outline" size={22} color="#fff" />
              <Text style={styles.changeText}>Change</Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(200).duration(600)}>
          <View style={[styles.uploadBox, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius * 1.5 }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="image-plus" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.uploadTitle, { color: colors.foreground }]}>Add your product</Text>
            <Text style={[styles.uploadHint, { color: colors.mutedForeground }]}>
              Upload a clear photo of your product — no background needed
            </Text>
            <View style={styles.uploadButtons}>
              <Pressable
                style={[styles.uploadBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={pickImage}
                disabled={picking}
              >
                {picking ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="images-outline" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.uploadBtnText, { color: colors.primaryForeground }]}>Gallery</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.uploadBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
                onPress={takePhoto}
                disabled={picking}
              >
                <Ionicons name="camera-outline" size={18} color={colors.primary} />
                <Text style={[styles.uploadBtnText, { color: colors.primary }]}>Camera</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {productImageUri && (
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.formSection}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PRODUCT NAME</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            value={productName}
            onChangeText={setProductName}
            placeholder="e.g. Glow Face Serum, Air Max 95..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>WHAT DOES IT DO? (optional)</Text>
          <TextInput
            style={[styles.inputMulti, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
            value={productDescription}
            onChangeText={setProductDescription}
            placeholder="Who is it for? What problem does it solve? What's the vibe?"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Animated.View>
      )}

      {productImageUri && (
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Pressable
            style={[styles.ctaButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={handleContinue}
          >
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>Next: Script & Hooks</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.featuresRow}>
        {([
          { icon: "script-text-outline", label: "AI Scripts" },
          { icon: "account-group-outline", label: "Avatars" },
          { icon: "angle-acute", label: "3 Ad Angles" },
          { icon: "lightning-bolt", label: "5 Moods" },
        ] as { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; label: string }[]).map((f) => (
          <View key={f.label} style={[styles.featureChip, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
            <MaterialCommunityIcons name={f.icon} size={14} color={colors.primary} />
            <Text style={[styles.featureLabel, { color: colors.secondaryForeground }]}>{f.label}</Text>
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headline: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  stepLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  previewContainer: { gap: 12 },
  previewWrapper: { position: "relative" },
  previewImage: { width: "100%", height: 300, resizeMode: "cover" },
  changeOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  changeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  uploadBox: { borderWidth: 1.5, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 12 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  uploadTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  uploadHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  uploadButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  uploadBtn: { flex: 1, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  uploadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  formSection: { gap: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  inputMulti: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 80 },
  ctaButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54 },
  ctaText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  featuresRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  featureChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  featureLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
