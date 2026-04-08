import React, { createContext, useContext, useState, useCallback } from "react";

export type AdAngle = "us-vs-them" | "before-after" | "social-proof";
export type LightingMood = "golden-hour" | "studio-white" | "moody-dark" | "outdoor-natural" | "neon";
export type AspectRatio = "9:16" | "1:1" | "4:5" | "16:9";
export type Platform = "tiktok" | "instagram" | "youtube";
export type ContentType = "photo" | "video" | "both";
export type AvatarGender = "male" | "female";
export type AvatarStyle = "casual" | "professional" | "streetwear" | "sporty";
export type AvatarLanguage =
  | "english"
  | "arabic"
  | "spanish"
  | "french"
  | "german"
  | "portuguese"
  | "hindi"
  | "chinese";

export interface AvatarConfig {
  enabled: boolean;
  gender: AvatarGender;
  style: AvatarStyle;
  language: AvatarLanguage;
  ethnicity: string;
}

export interface GeneratedImage {
  b64_json: string;
  index: number;
  hooks: Hook[];
}

export interface Hook {
  text: string;
  platform: string;
}

export interface Script {
  hook: string;
  body: string;
  cta: string;
  platform: string;
}

export interface GenerationResult {
  id: string;
  productImageUri: string;
  images: GeneratedImage[];
  videoUrl?: string;
  hooks: Hook[];
  angle: AdAngle;
  lighting: LightingMood;
  aspectRatio: AspectRatio;
  platform: Platform;
  contentType: ContentType;
  productName?: string;
  selectedScript?: Script;
  createdAt: number;
}

export interface UGCSettings {
  angle: AdAngle;
  lighting: LightingMood;
  aspectRatio: AspectRatio;
  count: number;
  contentType: ContentType;
  platform: Platform;
  videoDuration: number;
}

const DEFAULT_AVATAR: AvatarConfig = {
  enabled: false,
  gender: "female",
  style: "casual",
  language: "english",
  ethnicity: "diverse",
};

interface UGCContextValue {
  productImageUri: string | null;
  setProductImageUri: (uri: string | null) => void;
  productName: string;
  setProductName: (name: string) => void;
  productDescription: string;
  setProductDescription: (desc: string) => void;
  settings: UGCSettings;
  updateSettings: (partial: Partial<UGCSettings>) => void;
  avatar: AvatarConfig;
  updateAvatar: (partial: Partial<AvatarConfig>) => void;
  selectedScript: Script | null;
  setSelectedScript: (script: Script | null) => void;
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
  generateAllAnglesTrigger: number;
  triggerGenerateAllAngles: () => void;
}

const UGCContext = createContext<UGCContextValue | null>(null);

const DEFAULT_SETTINGS: UGCSettings = {
  angle: "social-proof",
  lighting: "golden-hour",
  aspectRatio: "9:16",
  count: 1,
  contentType: "photo",
  platform: "tiktok",
  videoDuration: 15,
};

export function UGCProvider({ children }: { children: React.ReactNode }) {
  const [productImageUri, setProductImageUri] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [settings, setSettings] = useState<UGCSettings>(DEFAULT_SETTINGS);
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [creativeVision, setCreativeVision] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [currentResult, setCurrentResult] = useState<GenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateTrigger, setGenerateTrigger] = useState(0);
  const [generateAllAnglesTrigger, setGenerateAllAnglesTrigger] = useState(0);

  const updateSettings = useCallback((partial: Partial<UGCSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const updateAvatar = useCallback((partial: Partial<AvatarConfig>) => {
    setAvatar((prev) => ({ ...prev, ...partial }));
  }, []);

  const addToHistory = useCallback((result: GenerationResult) => {
    setHistory((prev) => [result, ...prev]);
  }, []);

  const triggerGenerate = useCallback(() => {
    setGenerateTrigger((n) => n + 1);
  }, []);

  const triggerGenerateAllAngles = useCallback(() => {
    setGenerateAllAnglesTrigger((n) => n + 1);
  }, []);

  return (
    <UGCContext.Provider
      value={{
        productImageUri,
        setProductImageUri,
        productName,
        setProductName,
        productDescription,
        setProductDescription,
        settings,
        updateSettings,
        avatar,
        updateAvatar,
        selectedScript,
        setSelectedScript,
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
        generateAllAnglesTrigger,
        triggerGenerateAllAngles,
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
