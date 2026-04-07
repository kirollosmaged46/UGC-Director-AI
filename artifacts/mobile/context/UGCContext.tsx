import React, { createContext, useContext, useState, useCallback } from "react";

export type CameraAngle = "overhead" | "eye-level" | "low-angle" | "dutch-tilt" | "close-up" | "wide";
export type LightingMood = "golden-hour" | "studio-white" | "moody-dark" | "outdoor-natural" | "neon";
export type AspectRatio = "9:16" | "1:1" | "4:5" | "16:9";
export type Platform = "tiktok" | "instagram" | "youtube";
export type ContentType = "photo" | "video_concept" | "both";

export interface GeneratedImage {
  b64_json: string;
  index: number;
}

export interface VideoConcept {
  title: string;
  storyboard: string;
  index: number;
}

export interface Hook {
  text: string;
  platform: string;
}

export interface GenerationResult {
  id: string;
  productImageUri: string;
  images: GeneratedImage[];
  videoConcepts: VideoConcept[];
  hooks: Hook[];
  angle: CameraAngle;
  lighting: LightingMood;
  aspectRatio: AspectRatio;
  platform: Platform;
  contentType: ContentType;
  createdAt: number;
}

export interface UGCSettings {
  angle: CameraAngle;
  lighting: LightingMood;
  aspectRatio: AspectRatio;
  count: number;
  contentType: ContentType;
  platform: Platform;
}

interface UGCContextValue {
  productImageUri: string | null;
  setProductImageUri: (uri: string | null) => void;
  settings: UGCSettings;
  updateSettings: (partial: Partial<UGCSettings>) => void;
  creativeVision: string;
  setCreativeVision: (v: string) => void;
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  history: GenerationResult[];
  addToHistory: (result: GenerationResult) => void;
  currentResult: GenerationResult | null;
  setCurrentResult: (r: GenerationResult | null) => void;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
  generateTrigger: number;
  triggerGenerate: () => void;
}

const UGCContext = createContext<UGCContextValue | null>(null);

const DEFAULT_SETTINGS: UGCSettings = {
  angle: "eye-level",
  lighting: "golden-hour",
  aspectRatio: "9:16",
  count: 1,
  contentType: "photo",
  platform: "instagram",
};

export function UGCProvider({ children }: { children: React.ReactNode }) {
  const [productImageUri, setProductImageUri] = useState<string | null>(null);
  const [settings, setSettings] = useState<UGCSettings>(DEFAULT_SETTINGS);
  const [creativeVision, setCreativeVision] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [currentResult, setCurrentResult] = useState<GenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateTrigger, setGenerateTrigger] = useState(0);

  const updateSettings = useCallback((partial: Partial<UGCSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const addToHistory = useCallback((result: GenerationResult) => {
    setHistory((prev) => [result, ...prev]);
  }, []);

  const triggerGenerate = useCallback(() => {
    setGenerateTrigger((n) => n + 1);
  }, []);

  return (
    <UGCContext.Provider
      value={{
        productImageUri,
        setProductImageUri,
        settings,
        updateSettings,
        creativeVision,
        setCreativeVision,
        conversationId,
        setConversationId,
        history,
        addToHistory,
        currentResult,
        setCurrentResult,
        isGenerating,
        setIsGenerating,
        generateTrigger,
        triggerGenerate,
      }}
    >
      {children}
    </UGCContext.Provider>
  );
}

export function useUGC() {
  const ctx = useContext(UGCContext);
  if (!ctx) throw new Error("useUGC must be used within UGCProvider");
  return ctx;
}
