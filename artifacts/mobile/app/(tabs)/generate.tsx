import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Image,
  Platform,
  Share,
  ActivityIndicator,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { VideoView, useVideoPlayer } from "expo-video";
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
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT } from "./_layout";
import { useUGC, type GenerationResult, type GeneratedImage, type Hook, type AdAngle } from "@/context/UGCContext";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - 40;

const RATIO_MAP: Record<string, number> = {
  "9:16": 16 / 9,
  "1:1": 1,
  "4:5": 5 / 4,
  "16:9": 9 / 16,
};

function cardHeight(aspectRatio: string) {
  return CARD_W * (RATIO_MAP[aspectRatio] ?? 1);
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    if (uri.startsWith("data:")) {
      const parts = uri.split(",");
      return parts[1] ?? "";
    }
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve(dataUrl.split(",")[1] ?? "");
      };
      img.onerror = reject;
      img.src = objUrl;
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 600, easing: Easing.ease }), withTiming(0.3, { duration: 600, easing: Easing.ease })),
      -1
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

type GenPhase = "analyzing" | "scripting" | "photo" | "video" | "hooks" | "done";

const PHASE_LABELS: Record<GenPhase, string> = {
  analyzing: "Analyzing your product...",
  scripting: "Writing the script...",
  photo: "Generating photos...",
  video: "Generating video...",
  hooks: "Writing ad copy...",
  done: "Done!",
};

function GeneratingView({ phase, colors }: { phase: GenPhase; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1
    );
  }, [scale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeIn.duration(300)} style={[styles.generatingContainer, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.generatingIconWrap, { backgroundColor: colors.secondary }, iconStyle]}>
        <MaterialCommunityIcons name="creation" size={44} color={colors.primary} />
      </Animated.View>
      <View style={styles.dotsRow}>
        {[0, 1, 2].map((i) => (
          <PulsingDot key={i} color={colors.primary} />
        ))}
      </View>
      <Text style={[styles.generatingPhase, { color: colors.foreground }]}>{PHASE_LABELS[phase]}</Text>
      <Text style={[styles.generatingHint, { color: colors.mutedForeground }]}>
        Creating authentic UGC content for you
      </Text>
    </Animated.View>
  );
}

function VideoCard({ url, aspectRatio, colors }: { url: string; aspectRatio: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [muted, setMuted] = useState(false);
  const h = cardHeight(aspectRatio);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      player.muted = !m;
      return !m;
    });
  }, [player]);

  const saveVideo = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") return;
      const fileName = `ugc-video-${Date.now()}.mp4`;
      const dest = (FileSystem.cacheDirectory ?? "") + fileName;
      await FileSystem.downloadAsync(url, dest);
      await MediaLibrary.saveToLibraryAsync(dest);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, [url]);

  const shareVideo = useCallback(async () => {
    try {
      await Share.share({ url, message: "Check out this UGC ad!" });
    } catch {}
  }, [url]);

  return (
    <View style={[styles.videoCard, { width: CARD_W, height: h, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" }]}>
      <VideoView player={player} style={{ width: CARD_W, height: h }} contentFit="cover" />
      <View style={styles.videoControls}>
        <Pressable onPress={toggleMute} style={[styles.videoBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={18} color="#fff" />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={saveVideo} style={[styles.videoBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
            <Ionicons name="download-outline" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={shareVideo} style={[styles.videoBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
            <Ionicons name="share-outline" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const ANGLE_LABELS: Record<AdAngle, string> = {
  "us-vs-them": "Us vs. Them",
  "before-after": "Before & After",
  "social-proof": "Social Proof",
};

export default function GenerateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    productImageUri,
    productName,
    productDescription,
    settings,
    avatar,
    selectedScript,
    creativeVision,
    setIsGenerating,
    addToHistory,
    currentResult,
    setCurrentResult,
    generateTrigger,
    generateAllAnglesTrigger,
  } = useUGC();

  const [phase, setPhase] = useState<GenPhase | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const isRunning = useRef(false);

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const buildAvatarContext = useCallback(() => {
    if (!avatar.enabled) return "";
    return `Avatar creator: ${avatar.gender}, ${avatar.ethnicity} ethnicity, ${avatar.style} style, speaking ${avatar.language}. The avatar should appear to be a real UGC creator holding and presenting the product directly to camera.`;
  }, [avatar]);

  const buildVision = useCallback(() => {
    const parts: string[] = [];
    if (selectedScript) {
      parts.push(`Hook: "${selectedScript.hook}"`);
      if (selectedScript.body) parts.push(`Script: ${selectedScript.body}`);
      if (selectedScript.cta) parts.push(`CTA: ${selectedScript.cta}`);
    } else if (creativeVision) {
      parts.push(creativeVision);
    }
    const avatarCtx = buildAvatarContext();
    if (avatarCtx) parts.push(avatarCtx);
    return parts.join("\n\n");
  }, [selectedScript, creativeVision, buildAvatarContext]);

  const fetchHooks = useCallback(async (): Promise<Hook[]> => {
    const resp = await fetch(`${baseUrl}/api/ugc/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productDescription: productName || productDescription || "this product",
        platform: settings.platform,
        tone: "authentic",
        imageContext: creativeVision || undefined,
        count: 5,
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { hooks: Hook[] };
    return Array.isArray(data.hooks) ? data.hooks : [];
  }, [baseUrl, productName, productDescription, settings.platform, creativeVision]);

  const runGeneration = useCallback(async (imgUri: string) => {
    if (isRunning.current) return;
    isRunning.current = true;
    setPhase("analyzing");
    setIsGenerating(true);
    setGenerationError(null);
    setActiveImageIndex(0);

    try {
      const base64 = await uriToBase64(imgUri);
      const vision = buildVision();

      const allImages: GeneratedImage[] = [];
      let videoUrl: string | undefined;

      const needsPhoto = settings.contentType === "photo" || settings.contentType === "both";
      const needsVideo = settings.contentType === "video" || settings.contentType === "both";

      if (needsPhoto) {
        setPhase("photo");
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
            productName: productName || undefined,
            creativeVision: vision || undefined,
            avatarEnabled: avatar.enabled,
            avatarGender: avatar.gender,
            avatarStyle: avatar.style,
            avatarEthnicity: avatar.ethnicity,
            avatarLanguage: avatar.language,
            videoDuration: settings.videoDuration,
            fashionStyle: settings.fashionStyle || undefined,
          }),
        });
        if (!resp.ok) throw new Error(`Photo generation failed (${resp.status})`);
        const data = await resp.json() as { images: Array<{ b64_json: string; index: number }> };
        allImages.push(...data.images.map((img) => ({ b64_json: img.b64_json, index: img.index, hooks: [] })));
      }

      if (needsVideo) {
        setPhase("video");
        const resp = await fetch(`${baseUrl}/api/ugc/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            angle: settings.angle,
            lighting: settings.lighting,
            aspectRatio: settings.aspectRatio,
            count: 1,
            contentType: "video",
            platform: settings.platform,
            productName: productName || undefined,
            creativeVision: vision || undefined,
            avatarEnabled: avatar.enabled,
            avatarGender: avatar.gender,
            avatarStyle: avatar.style,
            avatarEthnicity: avatar.ethnicity,
            avatarLanguage: avatar.language,
            videoDuration: settings.videoDuration,
            fashionStyle: settings.fashionStyle || undefined,
          }),
        });
        if (!resp.ok) throw new Error(`Video generation failed (${resp.status})`);
        const data = await resp.json() as { videoUrl?: string };
        videoUrl = data.videoUrl;
      }

      setPhase("hooks");
      const hooks = await fetchHooks();
      if (allImages.length > 0) {
        allImages[0].hooks = hooks;
      }

      setPhase("done");
      const result: GenerationResult = {
        id: Math.random().toString(36).slice(2),
        productImageUri: imgUri,
        images: allImages,
        videoUrl,
        hooks,
        angle: settings.angle,
        lighting: settings.lighting,
        aspectRatio: settings.aspectRatio,
        platform: settings.platform,
        contentType: settings.contentType,
        productName: productName || undefined,
        selectedScript: selectedScript ?? undefined,
        createdAt: Date.now(),
      };
      setCurrentResult(result);
      addToHistory(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setGenerationError(msg);
      console.error("Generation error:", err);
    } finally {
      setPhase(null);
      setIsGenerating(false);
      isRunning.current = false;
    }
  }, [settings, avatar, productName, buildVision, fetchHooks, baseUrl, selectedScript, setIsGenerating, setCurrentResult, addToHistory]);

  useEffect(() => {
    if (!generateTrigger) return;
    isRunning.current = false;
    setGenerationError(null);
    if (productImageUri) runGeneration(productImageUri);
  }, [generateTrigger]);

  useEffect(() => {
    if (!generateAllAnglesTrigger) return;
    isRunning.current = false;
    setGenerationError(null);
    if (productImageUri) runGeneration(productImageUri);
  }, [generateAllAnglesTrigger]);

  const copyHook = useCallback((text: string, idx: number) => {
    Clipboard.setStringAsync(text).catch(() => {});
    setCopiedIndex(idx);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const saveImage = useCallback(async (b64: string) => {
    try {
      if (Platform.OS === "web") return;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") return;
      const uri = FileSystem.cacheDirectory + `ugc-${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, []);

  const shareImage = useCallback(async (b64: string) => {
    try {
      if (Platform.OS === "web") return;
      const uri = FileSystem.cacheDirectory + `ugc-share-${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
      await Share.share({ url: uri });
    } catch {}
  }, []);

  const isGenerating = phase !== null && phase !== "done";

  if (isGenerating) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <GeneratingView phase={phase!} colors={colors} />
      </View>
    );
  }

  if (!currentResult && !productImageUri) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="creation" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ready to create</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Upload your product and complete the flow to generate your first ad
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/index")}
            style={[styles.emptyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>Start with your product</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  if (!currentResult && productImageUri) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="creation" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Everything is set</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Your product, script, avatar and direction are ready. Hit generate.
          </Text>

          {generationError && (
            <View style={[styles.errorBanner, { backgroundColor: "#FEF2F2", borderRadius: colors.radius }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{generationError}</Text>
              <Pressable onPress={() => setGenerationError(null)}>
                <Ionicons name="close" size={16} color="#DC2626" />
              </Pressable>
            </View>
          )}

          <View style={styles.settingsSummary}>
            {[
              { label: "Platform", value: settings.platform.charAt(0).toUpperCase() + settings.platform.slice(1) },
              { label: "Angle", value: ANGLE_LABELS[settings.angle] },
              { label: "Format", value: settings.aspectRatio },
              { label: "Output", value: settings.contentType.charAt(0).toUpperCase() + settings.contentType.slice(1) },
              { label: "Avatar", value: avatar.enabled ? `${avatar.gender} · ${avatar.language}` : "Lifestyle only" },
              ...(selectedScript ? [{ label: "Hook", value: `"${selectedScript.hook.slice(0, 40)}${selectedScript.hook.length > 40 ? "…" : ""}"` }] : []),
            ].map((item) => (
              <View key={item.label} style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                <Text style={[styles.summaryValue, { color: colors.foreground }]}>{item.value}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => { setGenerationError(null); isRunning.current = false; if (productImageUri) runGeneration(productImageUri); }}
            style={[styles.generateNowBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <MaterialCommunityIcons name="creation" size={20} color="#fff" />
            <Text style={styles.generateNowText}>Generate Now</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(tabs)/director")}
            style={[styles.adjustBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <Ionicons name="options-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.adjustText, { color: colors.mutedForeground }]}>Adjust Direction</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  const result = currentResult!;
  const hooks = result.hooks ?? [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <View style={styles.resultHeader}>
          <View>
            <Text style={[styles.resultTitle, { color: colors.foreground }]}>Your Ad is Ready</Text>
            <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
              {ANGLE_LABELS[result.angle]} · {result.platform} · {result.aspectRatio}
            </Text>
          </View>
          <Pressable
            onPress={() => { setCurrentResult(null); setGenerationError(null); isRunning.current = false; }}
            style={[styles.regenerateBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
          >
            <Ionicons name="refresh" size={15} color={colors.primary} />
            <Text style={[styles.regenerateText, { color: colors.primary }]}>New</Text>
          </Pressable>
        </View>
      </Animated.View>

      {result.videoUrl && (
        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VIDEO</Text>
          <VideoCard url={result.videoUrl} aspectRatio={result.aspectRatio} colors={colors} />
        </Animated.View>
      )}

      {result.images.length > 0 && (
        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IMAGES</Text>
          <FlatList
            data={result.images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
              setActiveImageIndex(idx);
            }}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <View style={{ width: CARD_W }}>
                <Image
                  source={{ uri: `data:image/png;base64,${item.b64_json}` }}
                  style={{ width: CARD_W, height: cardHeight(result.aspectRatio), borderRadius: 16 }}
                  resizeMode="cover"
                />
                <View style={styles.imageActions}>
                  <Pressable
                    onPress={() => saveImage(item.b64_json)}
                    style={[styles.actionBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
                  >
                    <Ionicons name="download-outline" size={16} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>Save</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => shareImage(item.b64_json)}
                    style={[styles.actionBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
                  >
                    <Ionicons name="share-outline" size={16} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>Share</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
          {result.images.length > 1 && (
            <View style={styles.dotsIndicator}>
              {result.images.map((_, i) => (
                <View key={i} style={[styles.dotIndicator, { backgroundColor: i === activeImageIndex ? colors.primary : colors.border }]} />
              ))}
            </View>
          )}
        </Animated.View>
      )}

      {hooks.length > 0 && (
        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.hooksSection}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AD HOOKS & COPY</Text>
          {hooks.map((h, idx) => (
            <Pressable
              key={idx}
              onPress={() => copyHook(h.text, idx)}
              style={[styles.hookCard, { backgroundColor: colors.card, borderColor: copiedIndex === idx ? colors.primary : colors.border, borderRadius: colors.radius * 1.5 }]}
            >
              <Text style={[styles.hookText, { color: colors.foreground }]}>{h.text}</Text>
              <View style={styles.hookBottom}>
                <View style={[styles.hookPlatformBadge, { backgroundColor: colors.secondary, borderRadius: 6 }]}>
                  <Text style={[styles.hookPlatformText, { color: colors.primary }]}>{h.platform}</Text>
                </View>
                {copiedIndex === idx ? (
                  <View style={styles.copiedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text style={[styles.copiedText, { color: colors.primary }]}>Copied!</Text>
                  </View>
                ) : (
                  <Ionicons name="copy-outline" size={16} color={colors.mutedForeground} />
                )}
              </View>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {result.selectedScript && (
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.scriptResult}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SCRIPT USED</Text>
          <View style={[styles.scriptCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius * 1.5 }]}>
            <View style={[styles.scriptHookBox, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <Text style={[styles.scriptLabel, { color: colors.primary }]}>HOOK</Text>
              <Text style={[styles.scriptHookText, { color: colors.foreground }]}>{result.selectedScript.hook}</Text>
            </View>
            {result.selectedScript.body ? (
              <View>
                <Text style={[styles.scriptLabel, { color: colors.mutedForeground }]}>SCRIPT</Text>
                <Text style={[styles.scriptBodyText, { color: colors.foreground }]}>{result.selectedScript.body}</Text>
              </View>
            ) : null}
            {result.selectedScript.cta ? (
              <View>
                <Text style={[styles.scriptLabel, { color: colors.mutedForeground }]}>CTA</Text>
                <Text style={[styles.scriptCtaText, { color: colors.accent }]}>{result.selectedScript.cta}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(240).duration(400)}>
        <Pressable
          onPress={() => { setCurrentResult(null); setGenerationError(null); isRunning.current = false; }}
          style={[styles.newGenerationBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <MaterialCommunityIcons name="creation" size={18} color="#fff" />
          <Text style={styles.newGenerationText}>Generate New Variation</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fullScreen: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 20 },
  generatingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 40 },
  generatingIconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  dotsRow: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  generatingPhase: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  generatingHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  emptyIconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  emptyBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, width: "100%" },
  errorText: { flex: 1, color: "#DC2626", fontSize: 13, fontFamily: "Inter_400Regular" },
  settingsSummary: { width: "100%", borderRadius: 16, overflow: "hidden" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_700Bold", maxWidth: "60%", textAlign: "right" },
  generateNowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 56, width: "100%" },
  generateNowText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  adjustBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, width: "100%", borderWidth: 1 },
  adjustText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  resultSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  regenerateBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  regenerateText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 10 },
  videoCard: {},
  videoControls: { position: "absolute", bottom: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  videoBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  imageActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dotsIndicator: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dotIndicator: { width: 7, height: 7, borderRadius: 4 },
  hooksSection: { gap: 10 },
  hookCard: { padding: 14, borderWidth: 1, gap: 10 },
  hookText: { fontSize: 15, fontFamily: "Inter_500Medium", lineHeight: 22 },
  hookBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hookPlatformBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  hookPlatformText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  copiedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  copiedText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scriptResult: { gap: 10 },
  scriptCard: { padding: 14, borderWidth: 1, gap: 12 },
  scriptHookBox: { padding: 10, gap: 4 },
  scriptLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  scriptHookText: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 22 },
  scriptBodyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 4 },
  scriptCtaText: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  newGenerationBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54 },
  newGenerationText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
