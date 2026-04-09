export interface AdgenInputs {
  productName: string;
  productCategory: string;
  productDescription: string;
  adAngle: "us-vs-them" | "before-after" | "social-proof";
  platform: "tiktok" | "instagram-reels" | "youtube-shorts";
  aspectRatio: "9:16" | "1:1" | "4:5";
  videoDuration?: "15s" | "30s" | "60s";
  selectedAvatarId?: string;
  productImageBase64?: string;
  referenceVideoBase64?: string;
  creatorAvatarBase64?: string;
  hookStyle?: string;
  voiceoverLanguage?: "english" | "arabic";
  creativeVision?: string;
}

export interface SceneScript {
  scene_number: number;
  duration_seconds: number;
  visual: string;
  voiceover: string;
  emotion: string;
}

export interface AdScript {
  hook: string;
  hook_variants: string[];
  scenes: SceneScript[];
  cta: string;
  caption: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface AdgenJobResult {
  videoUrl: string;
  hook: string;
  hookVariants: string[];
  caption: string;
  script: AdScript;
}

export interface AdgenJob {
  jobId: string;
  status: JobStatus;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  audioWarning?: string;
  result?: AdgenJobResult;
  error?: string;
  inputs: AdgenInputs;
  createdAt: number;
}
