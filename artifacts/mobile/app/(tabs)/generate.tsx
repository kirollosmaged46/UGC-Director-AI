import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Platform,
  Alert,
  Share,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useUGC, type GenerationResult } from "@/context/UGCContext";
import { router } from "expo-router";

const { width: SCREEN_W } = Dimensions.get("window");

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

function PulsingDot({ color, delay }: { color: string; delay: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
        withTiming(0.3, { duration: 600, easing: Easing.in(Easing.ease) })
      ),
      -1
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginHorizontal: 3 }, style]} />
  );
}

function GeneratingView({ colors }: { colors: ReturnType<typeof useColors> }) {
  const rotate = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withTiming(360, { duration: 2000, easing: Easing.linear }), -1);
  }, []);
  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));
  return (
    <View style={styles.generatingContainer}>
      <Animated.View style={rotateStyle}>
        <MaterialCommunityIcons name="creation" size={52} color={colors.primary} />
      </Animated.View>
      <Text style={[styles.generatingTitle, { color: colors.foreground }]}>Generating</Text>
      <View style={styles.dotsRow}>
        <PulsingDot color={colors.primary} delay={0} />
        <PulsingDot color={colors.accent} delay={200} />
        <PulsingDot color={colors.primary} delay={400} />
      </View>
      <Text style={[styles.generatingHint, { color: colors.mutedForeground }]}>
        Creating authentic UGC content...
      </Text>
    </View>
  );
}

export default function GenerateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { productImageUri, settings, creativeVision, addToHistory, currentResult, setCurrentResult, setIsGenerating } = useUGC();
  const [isLoading, setIsLoading] = useState(false);
  const [hooks, setHooks] = useState<Array<{ text: string; platform: string }>>([]);
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const hasFetched = useRef(false);
  const generateRef = useRef<() => void>(() => {});

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchHooks = useCallback(async (productDesc: string, platform: string) => {
    setGeneratingHooks(true);
    try {
      const response = await fetch(`${baseUrl}/api/ugc/hooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription: productDesc,
          platform,
          tone: "authentic",
          imageContext: creativeVision || undefined,
        }),
      });
      const data = await response.json() as { hooks: Array<{ text: string; platform: string }> };
      setHooks(data.hooks ?? []);
    } catch {
      // silently ignore hook generation failures
    } finally {
      setGeneratingHooks(false);
    }
  }, [baseUrl, creativeVision]);

  const generate = useCallback(async () => {
    if (!productImageUri || hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    setIsGenerating(true);

    try {
      const base64 = await uriToBase64(productImageUri);

      const count = settings.contentType === "both" ? 1 : settings.count;
      const responses: Array<{ images: any[]; videoConcepts: any[] }> = [];

      if (settings.contentType === "photo" || settings.contentType === "both") {
        const resp = await fetch(`${baseUrl}/api/ugc/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            angle: settings.angle,
            lighting: settings.lighting,
            aspectRatio: settings.aspectRatio,
            count: settings.count,
            contentType: "photo",
            platform: settings.platform,
            creativeVision: creativeVision || undefined,
          }),
        });
        const data = await resp.json() as { images: any[]; videoConcepts: any[] };
        responses.push(data);
      }

      if (settings.contentType === "video_concept" || settings.contentType === "both") {
        const resp = await fetch(`${baseUrl}/api/ugc/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            angle: settings.angle,
            lighting: settings.lighting,
            aspectRatio: settings.aspectRatio,
            count: settings.count,
            contentType: "video_concept",
            platform: settings.platform,
            creativeVision: creativeVision || undefined,
          }),
        });
        const data = await resp.json() as { images: any[]; videoConcepts: any[] };
        responses.push(data);
      }

      const allImages = responses.flatMap((r) => r.images ?? []);
      const allConcepts = responses.flatMap((r) => r.videoConcepts ?? []);

      const result: GenerationResult = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        productImageUri,
        images: allImages,
        videoConcepts: allConcepts,
        hooks: [],
        angle: settings.angle,
        lighting: settings.lighting,
        aspectRatio: settings.aspectRatio,
        platform: settings.platform,
        contentType: settings.contentType,
        createdAt: Date.now(),
      };

      setCurrentResult(result);
      addToHistory(result);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      fetchHooks(creativeVision || "lifestyle product", settings.platform);
    } catch (err) {
      Alert.alert("Generation Failed", "Something went wrong. Please try again.", [
        { text: "Retry", onPress: () => { hasFetched.current = false; generate(); } },
        { text: "Go Back", onPress: () => router.back() },
      ]);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  }, [productImageUri, settings, creativeVision, baseUrl, addToHistory, setCurrentResult, setIsGenerating, fetchHooks]);

  useEffect(() => {
    generate();
  }, []);

  const saveImage = useCallback(async (b64: string) => {
    if (Platform.OS === "web") {
      Alert.alert("Info", "Save not supported on web. Use the share option.");
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow media library access to save images.");
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}ugc_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Image saved to your camera roll.");
    } catch {
      Alert.alert("Error", "Could not save image.");
    }
  }, []);

  const copyHook = useCallback(async (text: string, index: number) => {
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(text);
      setCopiedIndex(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GeneratingView colors={colors} />
      </View>
    );
  }

  if (!currentResult) return null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 12, paddingBottom: bottomPad + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Your Content</Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
          {currentResult.images.length} photo{currentResult.images.length !== 1 ? "s" : ""}
          {currentResult.videoConcepts.length > 0 ? ` + ${currentResult.videoConcepts.length} video concept${currentResult.videoConcepts.length !== 1 ? "s" : ""}` : ""}
        </Text>
      </Animated.View>

      {currentResult.images.map((img, i) => (
        <Animated.View
          key={img.index}
          entering={FadeIn.delay(i * 150).duration(400)}
          style={[styles.imageCard, { backgroundColor: colors.card, borderRadius: colors.radius * 1.5, borderColor: colors.border }]}
        >
          <Image
            source={{ uri: `data:image/png;base64,${img.b64_json}` }}
            style={[styles.generatedImage, { borderRadius: colors.radius }]}
            resizeMode="cover"
          />
          <View style={styles.imageActions}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
              onPress={() => saveImage(img.b64_json)}
            >
              <Ionicons name="download-outline" size={18} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Save</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={async () => {
                if (Platform.OS !== "web") {
                  const fileUri = `${FileSystem.cacheDirectory}ugc_share_${Date.now()}.png`;
                  await FileSystem.writeAsStringAsync(fileUri, img.b64_json, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                  await Share.share({ url: fileUri });
                }
              }}
            >
              <Ionicons name="share-outline" size={18} color={colors.primaryForeground} />
              <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Share</Text>
            </Pressable>
          </View>
        </Animated.View>
      ))}

      {currentResult.videoConcepts.map((vc, i) => (
        <Animated.View
          key={vc.index}
          entering={FadeInDown.delay(200 + i * 100).duration(400)}
          style={[styles.conceptCard, { backgroundColor: colors.card, borderRadius: colors.radius * 1.5, borderColor: colors.border }]}
        >
          <View style={styles.conceptHeader}>
            <MaterialCommunityIcons name="film-outline" size={20} color={colors.primary} />
            <Text style={[styles.conceptTitle, { color: colors.foreground }]}>{vc.title}</Text>
          </View>
          <Text style={[styles.conceptBody, { color: colors.mutedForeground }]}>{vc.storyboard}</Text>
        </Animated.View>
      ))}

      <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.hooksSection}>
        <View style={styles.hooksTitleRow}>
          <Text style={[styles.hooksTitle, { color: colors.foreground }]}>Hooks</Text>
          {generatingHooks && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        <Text style={[styles.hooksSub, { color: colors.mutedForeground }]}>
          Scroll-stopping captions for {currentResult.platform}
        </Text>
        {hooks.map((hook, i) => (
          <Pressable
            key={i}
            onPress={() => copyHook(hook.text, i)}
            style={[
              styles.hookItem,
              {
                backgroundColor: copiedIndex === i ? colors.secondary : colors.card,
                borderColor: copiedIndex === i ? colors.primary : colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.hookText, { color: colors.foreground }]}>{hook.text}</Text>
            <Ionicons
              name={copiedIndex === i ? "checkmark" : "copy-outline"}
              size={16}
              color={copiedIndex === i ? colors.primary : colors.mutedForeground}
            />
          </Pressable>
        ))}
        {!generatingHooks && hooks.length === 0 && (
          <View style={[styles.emptyHooks, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.emptyHooksText, { color: colors.mutedForeground }]}>
              Hooks generate after images are ready
            </Text>
          </View>
        )}
      </Animated.View>

      <Pressable
        style={[styles.regenerateBtn, { borderColor: colors.primary, borderRadius: colors.radius }]}
        onPress={() => {
          hasFetched.current = false;
          setCurrentResult(null);
          generate();
        }}
      >
        <MaterialCommunityIcons name="refresh" size={18} color={colors.primary} />
        <Text style={[styles.regenerateBtnText, { color: colors.primary }]}>Regenerate</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  pageTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  pageSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  generatingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  generatingTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  dotsRow: { flexDirection: "row", alignItems: "center" },
  generatingHint: { fontSize: 14, fontFamily: "Inter_400Regular" },
  imageCard: {
    borderWidth: 1,
    overflow: "hidden",
    gap: 0,
  },
  generatedImage: {
    width: "100%",
    height: SCREEN_W * 1.2,
  },
  imageActions: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  conceptCard: {
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  conceptHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  conceptTitle: { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  conceptBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  hooksSection: { gap: 10 },
  hooksTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hooksTitle: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  hooksSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  hookItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  hookText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  emptyHooks: { padding: 16, alignItems: "center" },
  emptyHooksText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  regenerateBtn: {
    height: 48,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  regenerateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
