import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { TAB_BAR_HEIGHT } from "./_layout";
import { useUGC, type GenerationResult } from "@/context/UGCContext";

const VIDEO_URL_TTL_MS = 24 * 60 * 60 * 1000;

function ResultCard({ item }: { item: GenerationResult }) {
  const colors = useColors();
  const firstImage = item.images[0];
  const hasVideo = !!item.videoUrl;
  const videoExpired = hasVideo && Date.now() - item.createdAt > VIDEO_URL_TTL_MS;

  return (
    <Animated.View
      entering={FadeInDown.duration(400)}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius * 1.5,
        },
      ]}
    >
      {firstImage ? (
        <Image
          source={{ uri: `data:image/png;base64,${firstImage.b64_json}` }}
          style={[styles.cardImage, { borderRadius: colors.radius }]}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.cardImagePlaceholder,
            { backgroundColor: colors.secondary, borderRadius: colors.radius },
          ]}
        >
          <MaterialCommunityIcons name="video-outline" size={32} color={colors.primary} />
        </View>
      )}
      <View style={styles.cardInfo}>
        <View style={styles.cardTags}>
          <View style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 6 }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>{item.platform}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 6 }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>{item.aspectRatio}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 6 }]}>
            <Text style={[styles.tagText, { color: colors.primary }]}>{item.angle}</Text>
          </View>
        </View>
        <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
          {item.images.length} image{item.images.length !== 1 ? "s" : ""}
          {hasVideo ? " + 1 video" : ""}
          {" · "}
          {new Date(item.createdAt).toLocaleDateString()}
          {videoExpired ? " · video expired" : hasVideo ? " · video 24h" : ""}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { history } = useUGC();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>History</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {history.length} session{history.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No sessions yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Your generated content will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={({ item }) => <ResultCard item={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingTop: 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  list: { paddingHorizontal: 20, gap: 16 },
  card: { borderWidth: 1, overflow: "hidden", gap: 0 },
  cardImage: { width: "100%", height: 200, resizeMode: "cover" },
  cardImagePlaceholder: {
    width: "100%",
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { padding: 12, gap: 8 },
  cardTags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
