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
  Alert,
  Share,
  ActivityIndicator,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
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

function imageHeight(aspectRatio: string): number {
  return CARD_W * (RATIO_MAP[aspectRatio] ?? 1);
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const img = new Image();
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
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
        withTiming(0.3, { duration: 600, easing: Easing.in(Easing.ease) })
      ),
      -1
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginHorizontal: 3 },
        style,
      ]}
    />
  );
}

function GeneratingView({
  colors,
  phase,
  allAnglesMode,
}: {
  colors: ReturnType<typeof useColors>;
  phase?: "photo" | "video";
  allAnglesMode?: boolean;
}) {
  const rotate = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withTiming(360, { duration: 2000, easing: Easing.linear }), -1);
  }, []);
  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));
  const titleText = allAnglesMode
    ? "Generating all 3 angles..."
    : phase === "video"
    ? "Generating video..."
    : phase === "photo"
    ? "Generating photos..."
    : "Generating...";
  const hintText = allAnglesMode
    ? "Us vs. Them · Before & After · Social Proof"
    : phase === "video"
    ? "3 AI scenes → ffmpeg render → ~45s"
    : "Creating authentic UGC content...";
  return (
    <View style={styles.generatingContainer}>
      <Animated.View style={rotateStyle}>
        <MaterialCommunityIcons name="creation" size={52} color={colors.primary} />
      </Animated.View>
      <Text style={[styles.generatingTitle, { color: colors.foreground }]}>
        {titleText}
      </Text>
      <View style={styles.dotsRow}>
        <PulsingDot color={colors.primary} />
        <PulsingDot color={colors.accent} />
        <PulsingDot color={colors.primary} />
      </View>
      <Text style={[styles.generatingHint, { color: colors.mutedForeground }]}>
        {hintText}
      </Text>
    </View>
  );
}

function VideoCard({
  videoUrl,
  aspectRatio,
  colors,
}: {
  videoUrl: string;
  aspectRatio: string;
  colors: ReturnType<typeof useColors>;
}) {
  const [muted, setMuted] = useState(true);
  const [saving, setSaving] = useState(false);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [muted, player]);

  const saveVideo = useCallback(async () => {
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = videoUrl;
      a.download = `ugc_video_${Date.now()}.mp4`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow media library access to save videos.");
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory ?? ""}ugc_video_${Date.now()}.mp4`;
      const result = await FileSystem.downloadAsync(videoUrl, fileUri);
      await MediaLibrary.saveToLibraryAsync(result.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Video saved to your camera roll.");
    } catch {
      Alert.alert("Error", "Could not save video.");
    } finally {
      setSaving(false);
    }
  }, [videoUrl]);

  const shareVideo = useCallback(async () => {
    if (Platform.OS === "web") {
      if (navigator.share) {
        try { await navigator.share({ url: videoUrl, title: "UGC Video" }); } catch { /* ignore */ }
      } else {
        window.open(videoUrl, "_blank");
      }
      return;
    }
    try {
      const fileUri = `${FileSystem.cacheDirectory ?? ""}ugc_share_video_${Date.now()}.mp4`;
      const result = await FileSystem.downloadAsync(videoUrl, fileUri);
      await Share.share({ url: result.uri });
    } catch {
      // ignore
    }
  }, [videoUrl]);

  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.videoCardWrapper}>
      <View
        style={[
          styles.videoCard,
          {
            backgroundColor: colors.card,
            borderRadius: colors.radius * 1.5,
            borderColor: colors.border,
          },
        ]}
      >
        <Pressable onPress={toggleMute} style={{ position: "relative" }}>
          <VideoView
            player={player}
            style={[styles.videoPlayer, { height: imageHeight(aspectRatio) }]}
            allowsPictureInPicture
            contentFit="cover"
          />
          <View style={[styles.videoBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="film-outline" size={12} color={colors.primaryForeground} />
            <Text style={[styles.videoBadgeText, { color: colors.primaryForeground }]}>
              Real Video · ~12s
            </Text>
          </View>
          <View style={[styles.muteBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
            <Ionicons
              name={muted ? "volume-mute-outline" : "volume-high-outline"}
              size={16}
              color="#fff"
            />
          </View>
        </Pressable>
        <View style={styles.imageActions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
            onPress={() => void saveVideo()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Ionicons name="download-outline" size={18} color={colors.foreground} />
            )}
            <Text style={[styles.actionBtnText, { color: colors.foreground }]}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={() => void shareVideo()}
          >
            <Ionicons name="share-outline" size={18} color={colors.primaryForeground} />
            <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Share</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

type AngleResult = { angle: AdAngle; label: string; images: GeneratedImage[] };

const ANGLE_LABELS: Record<AdAngle, string> = {
  "us-vs-them": "Us vs. Them",
  "before-after": "Before & After",
  "social-proof": "Social Proof",
};
const ALL_ANGLES: AdAngle[] = ["us-vs-them", "before-after", "social-proof"];

const WIDE_VARIANT_LIGHTING: Record<AdAngle, string> = {
  "us-vs-them": "studio-white",
  "before-after": "golden-hour",
  "social-proof": "outdoor-natural",
};

export default function GenerateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    productImageUri,
    settings,
    creativeVision,
    addToHistory,
    currentResult,
    setCurrentResult,
    setIsGenerating,
    generateTrigger,
    generateAllAnglesTrigger,
  } = useUGC();

  const [isLoading, setIsLoading] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<"photo" | "video" | undefined>(undefined);
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [allAnglesResults, setAllAnglesResults] = useState<AngleResult[] | null>(null);
  const [activeAngleTab, setActiveAngleTab] = useState(0);
  const [isAllAnglesLoading, setIsAllAnglesLoading] = useState(false);
  const isRunning = useRef(false);

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const fetchHooksData = useCallback(
    async (productDesc: string, platform: string): Promise<Hook[]> => {
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
      if (!response.ok) throw new Error(`Hooks API error: ${response.status}`);
      const data = (await response.json()) as { hooks: Hook[] };
      if (!Array.isArray(data.hooks)) return [];
      return data.hooks;
    },
    [baseUrl, creativeVision]
  );

  const runGeneration = useCallback(
    async (imgUri: string) => {
      if (isRunning.current) return;
      isRunning.current = true;
      setIsLoading(true);
      setIsGenerating(true);
      setActiveImageIndex(0);

      try {
        const base64 = await uriToBase64(imgUri);

        type ApiResponse = {
          images: Array<{ b64_json: string; index: number; aspectRatio?: string }>;
          videoUrl?: string;
        };

        const allImages: GeneratedImage[] = [];
        let videoUrl: string | undefined;

        const isVideo = settings.contentType === "video";
        const needsPhoto = settings.contentType === "photo" || settings.contentType === "both";
        const needsVideo = settings.contentType === "video" || settings.contentType === "both";

        if (needsPhoto) {
          setGeneratingPhase("photo");
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
          if (!resp.ok) throw new Error(`Generate API error: ${resp.status}`);
          const data = (await resp.json()) as ApiResponse;
          if (!Array.isArray(data.images)) throw new Error("Malformed generate response");
          allImages.push(...data.images.map((img) => ({ b64_json: img.b64_json, index: img.index, hooks: [] })));
        }

        if (needsVideo) {
          setGeneratingPhase("video");
          const resp = await fetch(`${baseUrl}/api/ugc/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64,
              angle: settings.angle,
              lighting: settings.lighting,
              aspectRatio: settings.aspectRatio,
              count: 1, // count is ignored server-side for video (always 3 keyframes)
              contentType: "video",
              platform: settings.platform,
              creativeVision: creativeVision || undefined,
            }),
          });
          if (!resp.ok) throw new Error(`Video generate API error: ${resp.status}`);
          const data = (await resp.json()) as ApiResponse;
          if (!data.videoUrl) {
            throw new Error("Video generation succeeded but no videoUrl was returned");
          }
          videoUrl = data.videoUrl;
        }

        let hooks: Hook[] = [];
        if (allImages.length > 0) {
          setGeneratingHooks(true);
          const perImageHooks = await Promise.all(
            allImages.map((_, i) =>
              fetchHooksData(
                `${creativeVision || "lifestyle product"} — image ${i + 1} of ${allImages.length}`,
                settings.platform
              ).catch(() => [] as Hook[])
            )
          );
          setGeneratingHooks(false);
          allImages.forEach((img, i) => { img.hooks = perImageHooks[i] ?? []; });
          hooks = perImageHooks.flat();
        } else if (isVideo) {
          setGeneratingHooks(true);
          hooks = await fetchHooksData(
            creativeVision || "lifestyle product video",
            settings.platform
          ).catch(() => []);
          setGeneratingHooks(false);
        }

        const result: GenerationResult = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          productImageUri: imgUri,
          images: allImages,
          videoUrl,
          hooks,
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
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error occurred";
        Alert.alert("Generation Failed", errMsg, [
          {
            text: "Retry",
            onPress: () => {
              isRunning.current = false;
              if (productImageUri) void runGeneration(productImageUri);
            },
          },
          { text: "Dismiss" },
        ]);
      } finally {
        setIsLoading(false);
        setGeneratingPhase(undefined);
        setIsGenerating(false);
        isRunning.current = false;
      }
    },
    [settings, creativeVision, baseUrl, addToHistory, setCurrentResult, setIsGenerating, fetchHooksData, productImageUri]
  );

  const runGenerateAllAngles = useCallback(
    async (imgUri: string) => {
      if (isRunning.current) return;
      isRunning.current = true;
      setIsLoading(true);
      setIsAllAnglesLoading(true);
      setIsGenerating(true);
      setAllAnglesResults(null);
      setActiveAngleTab(0);
      setCurrentResult(null);
      setGeneratingPhase("photo");

      try {
        const base64 = await uriToBase64(imgUri);
        type ApiResponse = {
          images: Array<{ b64_json: string; index: number; aspectRatio?: string }>;
        };

        const angleRequests = ALL_ANGLES.map((angle) =>
          fetch(`${baseUrl}/api/ugc/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64,
              angle,
              lighting: WIDE_VARIANT_LIGHTING[angle],
              aspectRatio: settings.aspectRatio,
              count: 1,
              contentType: "photo",
              platform: settings.platform,
              creativeVision: creativeVision || undefined,
            }),
          }).then(async (resp) => {
            if (!resp.ok) throw new Error(`Generate API error for angle ${angle}: ${resp.status}`);
            const data = (await resp.json()) as ApiResponse;
            if (!Array.isArray(data.images)) throw new Error("Malformed response");
            return {
              angle,
              label: ANGLE_LABELS[angle],
              images: data.images.map((img) => ({ b64_json: img.b64_json, index: img.index, hooks: [] })),
            } satisfies AngleResult;
          })
        );

        const results = await Promise.all(angleRequests);
        setAllAnglesResults(results);
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Generation failed");
      } finally {
        setIsLoading(false);
        setIsAllAnglesLoading(false);
        setGeneratingPhase(undefined);
        setIsGenerating(false);
        isRunning.current = false;
      }
    },
    [settings, creativeVision, baseUrl, setCurrentResult, setIsGenerating]
  );

  useEffect(() => {
    if (generateTrigger > 0 && productImageUri) {
      setAllAnglesResults(null);
      setCurrentResult(null);
      void runGeneration(productImageUri);
    }
  }, [generateTrigger]);

  useEffect(() => {
    if (generateAllAnglesTrigger > 0 && productImageUri) {
      void runGenerateAllAngles(productImageUri);
    }
  }, [generateAllAnglesTrigger]);

  const saveImage = useCallback(async (b64: string) => {
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${b64}`;
      a.download = `ugc_image_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow media library access to save images.");
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory ?? ""}ugc_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: "base64" });
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Image saved to your camera roll.");
    } catch {
      Alert.alert("Error", "Could not save image.");
    }
  }, []);

  const shareImage = useCallback(async (b64: string) => {
    if (Platform.OS === "web") {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }
    try {
      const fileUri = `${FileSystem.cacheDirectory ?? ""}ugc_share_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: "base64" });
      await Share.share({ url: fileUri });
    } catch { /* ignore */ }
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
        <GeneratingView
          colors={colors}
          phase={generatingPhase ?? (settings.contentType === "video" ? "video" : "photo")}
          allAnglesMode={isAllAnglesLoading}
        />
      </View>
    );
  }

  if (allAnglesResults) {
    const activeResult = allAnglesResults[activeAngleTab];
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 12, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>All 3 Angles</Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Compare results side by side
          </Text>
        </Animated.View>

        <View style={[styles.angleTabs, { borderColor: colors.border }]}>
          {allAnglesResults.map((r, i) => (
            <Pressable
              key={r.angle}
              onPress={() => { setActiveAngleTab(i); setActiveImageIndex(0); Haptics.selectionAsync(); }}
              style={[
                styles.angleTab,
                {
                  backgroundColor: activeAngleTab === i ? colors.primary : "transparent",
                  borderRadius: colors.radius - 2,
                },
              ]}
            >
              <Text
                style={[
                  styles.angleTabText,
                  { color: activeAngleTab === i ? colors.primaryForeground : colors.mutedForeground },
                ]}
                numberOfLines={1}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeResult && activeResult.images.length > 0 && (
          <Animated.View entering={FadeIn.duration(300)}>
            <FlatList
              data={activeResult.images}
              keyExtractor={(item) => `${activeResult.angle}-${item.index}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
                if (idx !== activeImageIndex) setActiveImageIndex(idx);
              }}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.imageCard,
                    { width: CARD_W, backgroundColor: colors.card, borderRadius: colors.radius * 1.5, borderColor: colors.border },
                  ]}
                >
                  <Image
                    source={{ uri: `data:image/png;base64,${item.b64_json}` }}
                    style={[styles.generatedImage, { height: imageHeight(settings.aspectRatio) }]}
                    resizeMode="cover"
                  />
                  <View style={styles.imageActions}>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
                      onPress={() => void saveImage(item.b64_json)}
                    >
                      <Ionicons name="download-outline" size={18} color={colors.foreground} />
                      <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Save</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                      onPress={() => void shareImage(item.b64_json)}
                    >
                      <Ionicons name="share-outline" size={18} color={colors.primaryForeground} />
                      <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>Share</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          </Animated.View>
        )}

        <Pressable
          style={[styles.regenerateBtn, { borderColor: colors.primary, borderRadius: colors.radius }]}
          onPress={() => {
            if (productImageUri) {
              setAllAnglesResults(null);
              isRunning.current = false;
              void runGenerateAllAngles(productImageUri);
            }
          }}
        >
          <MaterialCommunityIcons name="refresh" size={18} color={colors.primary} />
          <Text style={[styles.regenerateBtnText, { color: colors.primary }]}>Regenerate All Angles</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!currentResult) {
    return (
      <View style={[styles.container, styles.emptyState, { backgroundColor: colors.background }]}>
        <MaterialCommunityIcons name="creation" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing generated yet</Text>
        <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
          Upload a product image, set your direction, then tap "Generate Content"
        </Text>
      </View>
    );
  }

  const hooksSource =
    currentResult.images.length > 0
      ? (currentResult.images[activeImageIndex]?.hooks ?? [])
      : currentResult.hooks;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 12, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Your Content</Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
          {currentResult.images.length > 0
            ? `${currentResult.images.length} photo${currentResult.images.length !== 1 ? "s" : ""}${currentResult.videoUrl ? " + 1 video" : ""}`
            : currentResult.videoUrl
            ? "1 video · ~12 seconds"
            : "Ready"}
        </Text>
      </Animated.View>

      {currentResult.images.length > 0 && (
        <Animated.View entering={FadeIn.duration(400)}>
          <FlatList
            data={currentResult.images}
            keyExtractor={(item) => String(item.index)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
              if (idx !== activeImageIndex) {
                setActiveImageIndex(idx);
                setCopiedIndex(null);
              }
            }}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.imageCard,
                  {
                    width: CARD_W,
                    backgroundColor: colors.card,
                    borderRadius: colors.radius * 1.5,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Image
                  source={{ uri: `data:image/png;base64,${item.b64_json}` }}
                  style={[
                    styles.generatedImage,
                    {
                      borderRadius: colors.radius,
                      height: imageHeight(currentResult.aspectRatio),
                    },
                  ]}
                  resizeMode="cover"
                />
                <View style={styles.imageActions}>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      { backgroundColor: colors.secondary, borderRadius: colors.radius },
                    ]}
                    onPress={() => void saveImage(item.b64_json)}
                  >
                    <Ionicons name="download-outline" size={18} color={colors.foreground} />
                    <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      { backgroundColor: colors.primary, borderRadius: colors.radius },
                    ]}
                    onPress={() => void shareImage(item.b64_json)}
                  >
                    <Ionicons name="share-outline" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                      Share
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
          {currentResult.images.length > 1 && (
            <View style={styles.paginationDots}>
              {currentResult.images.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === activeImageIndex ? colors.primary : colors.border,
                      width: i === activeImageIndex ? 18 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </Animated.View>
      )}

      {currentResult.videoUrl && (
        <VideoCard
          videoUrl={currentResult.videoUrl}
          aspectRatio={currentResult.aspectRatio}
          colors={colors}
        />
      )}

      <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.hooksSection}>
        <View style={styles.hooksTitleRow}>
          <Text style={[styles.hooksTitle, { color: colors.foreground }]}>
            Hooks{currentResult.images.length > 1 ? ` · Image ${activeImageIndex + 1}` : ""}
          </Text>
          {generatingHooks && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        <Text style={[styles.hooksSub, { color: colors.mutedForeground }]}>
          Scroll-stopping captions for {currentResult.platform}
        </Text>
        {hooksSource.map((hook, i) => (
          <Pressable
            key={i}
            onPress={() => void copyHook(hook.text, i)}
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
        {!generatingHooks && hooksSource.length === 0 && (
          <View
            style={[
              styles.emptyHooks,
              { backgroundColor: colors.card, borderRadius: colors.radius },
            ]}
          >
            <Text style={[styles.emptyHooksText, { color: colors.mutedForeground }]}>
              Hooks will appear here once generated
            </Text>
          </View>
        )}
      </Animated.View>

      <Pressable
        style={[
          styles.regenerateBtn,
          { borderColor: colors.primary, borderRadius: colors.radius },
        ]}
        onPress={() => {
          if (productImageUri) {
            setCurrentResult(null);
            isRunning.current = false;
            void runGeneration(productImageUri);
          }
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
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
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
  imageCard: { borderWidth: 1, overflow: "hidden" },
  generatedImage: { width: "100%" },
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
  },
  dot: { height: 6, borderRadius: 3 },
  imageActions: { flexDirection: "row", gap: 10, padding: 12 },
  actionBtn: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  videoCardWrapper: { gap: 0 },
  videoCard: { borderWidth: 1, overflow: "hidden" },
  videoPlayer: { width: "100%" },
  videoBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  videoBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  muteBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
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
  angleTabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  angleTab: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  angleTabText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
