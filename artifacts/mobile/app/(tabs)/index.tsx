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
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useUGC } from "@/context/UGCContext";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { productImageUri, setProductImageUri } = useUGC();
  const [picking, setPicking] = useState(false);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

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
      Alert.alert("Error", "Could not pick image. Please try again.");
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
      Alert.alert("Error", "Could not open camera. Please try again.");
    } finally {
      setPicking(false);
    }
  }, [setProductImageUri]);

  const handleContinue = useCallback(() => {
    if (!productImageUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/director");
  }, [productImageUri]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: bottomPad + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(600).springify()}>
        <Text style={[styles.headline, { color: colors.foreground }]}>UGC Studio</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Drop your product. Get authentic content.
        </Text>
      </Animated.View>

      {productImageUri ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.previewContainer}>
          <Pressable onPress={pickImage} style={styles.previewWrapper}>
            <Image source={{ uri: productImageUri }} style={[styles.previewImage, { borderRadius: colors.radius }]} />
            <View style={[styles.changeOverlay, { borderRadius: colors.radius }]}>
              <Ionicons name="camera-outline" size={28} color="#fff" />
              <Text style={styles.changeText}>Change</Text>
            </View>
          </Pressable>

          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <Pressable
              style={[styles.ctaButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={handleContinue}
            >
              <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>Set Direction</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.uploadArea}>
          <View
            style={[
              styles.uploadBox,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                borderRadius: colors.radius * 2,
              },
            ]}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="image-plus" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.uploadTitle, { color: colors.foreground }]}>Add your product</Text>
            <Text style={[styles.uploadHint, { color: colors.mutedForeground }]}>
              Upload a clear photo of your product to start generating authentic UGC content
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
                style={[
                  styles.uploadBtn,
                  {
                    backgroundColor: colors.secondary,
                    borderRadius: colors.radius,
                  },
                ]}
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

      <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.featuresRow}>
        {[
          { icon: "angle-acute", label: "6 Angles", lib: "MaterialCommunityIcons" },
          { icon: "lightning-bolt", label: "5 Moods", lib: "MaterialCommunityIcons" },
          { icon: "brain", label: "AI Director", lib: "MaterialCommunityIcons" },
        ].map((f) => (
          <View key={f.label} style={[styles.featureChip, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
            <MaterialCommunityIcons name={f.icon as any} size={16} color={colors.primary} />
            <Text style={[styles.featureLabel, { color: colors.secondaryForeground }]}>{f.label}</Text>
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 24 },
  headline: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  sub: { fontSize: 16, fontFamily: "Inter_400Regular", marginTop: 4 },
  previewContainer: { gap: 16 },
  previewWrapper: { position: "relative" },
  previewImage: { width: "100%", height: 420, resizeMode: "cover" },
  changeOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  changeText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
  },
  ctaText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  uploadArea: { gap: 0 },
  uploadBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  uploadTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  uploadHint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  uploadButtons: { flexDirection: "row", gap: 12, marginTop: 8 },
  uploadBtn: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  featuresRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  featureLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
