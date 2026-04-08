import { z } from "zod";

export const AD_ANGLE_ENUM = ["us-vs-them", "before-after", "social-proof"] as const;
export type AdAngle = typeof AD_ANGLE_ENUM[number];

export const ModelConceptSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(z.object({ description: z.string().min(1) })).length(3),
});

export function buildAngleNarrative(angle: AdAngle): string {
  switch (angle) {
    case "us-vs-them":
      return "Comparative narrative: product is the clear superior choice. Visual cues suggest contrast with a lesser alternative — the difference in quality, results, or lifestyle is obvious at a glance. Side-by-side feel, product positioned as the upgrade.";
    case "before-after":
      return "Transformation narrative: implies a before-state (the problem — tired, messy, ordinary, lacking) and celebrates the after-state (confident, elevated, resolved). The product is the catalyst. Composition should evoke change — progression, contrast, relief, uplift.";
    case "social-proof":
      return "Community narrative: suggests the product is already part of real people's lives. Aspirational group energy — feels like everyone's already using it and loving it. Lifestyle context, warm social setting, organic endorsement feel.";
  }
}

export function buildUgcPrompt(params: {
  angle: AdAngle;
  lighting: string;
  aspectRatio: string;
  platform: string;
  creativeVision?: string;
  sceneContext?: string;
}): string {
  const { angle, lighting, aspectRatio, platform, creativeVision, sceneContext } = params;

  const angleNarrative = buildAngleNarrative(angle);

  const lightingMap: Record<string, string> = {
    "golden-hour": "warm golden-hour sunlight streaming in from the side, long soft shadows, natural warmth — feels like the end of a perfect day",
    "studio-white": "clean bright diffused light, slightly warm, like a well-lit bedroom or kitchen counter — real space, not a photo studio",
    "moody-dark": "moody low-key dramatic lighting, deep rich shadows, cinematic atmosphere — intimate and intentional",
    "outdoor-natural": "bright open natural daylight, soft beautiful diffusion — the kind of light you get near a window or outside on an overcast day",
    neon: "vibrant neon accent lighting with colorful glowing reflections — nightlife energy, urban creative aesthetic",
  };

  const ratioMap: Record<string, string> = {
    "9:16": "vertical portrait 9:16 full-bleed composition optimized for TikTok and Reels — fill the frame",
    "1:1": "square 1:1 composition centered and balanced",
    "4:5": "portrait 4:5 composition for Instagram feed — elegant proportions",
    "16:9": "landscape 16:9 composition ready for YouTube — wide, breathing room",
  };

  const platformMap: Record<string, string> = {
    tiktok: "TikTok-native: raw, handheld energy, Gen Z authentic, feels shot on an iPhone in one take",
    instagram: "Instagram feel: lifestyle-authentic, visually rich, the kind of content a real creator would post",
    youtube: "YouTube-ready: dynamic composition, thumbnail-worthy framing, clear and engaging",
  };

  const lightingDesc = lightingMap[lighting] ?? lighting;
  const ratioDesc = ratioMap[aspectRatio] ?? aspectRatio;
  const platformDesc = platformMap[platform] ?? platform;

  let prompt = `Authentic UGC content. Real person energy — not stock photography, not a studio shoot. `;
  prompt += `Shot on a smartphone, slightly imperfect framing, natural and unscripted. `;
  prompt += `${ratioDesc}. ${lightingDesc}. ${platformDesc}. `;
  prompt += `\n\nAd angle / narrative: ${angleNarrative} `;
  prompt += `\n\nProduct is prominently featured in a genuine real-world setting. `;
  prompt += `Hands, forearms, or body present to make it feel like a real person is there. `;
  prompt += `Real-world background — kitchen counter, bedroom, bathroom vanity, outdoor setting, cafe — NOT a white studio backdrop. `;
  prompt += `Phone camera aesthetic with natural micro-imperfections. No text overlays. No watermarks. No logos. `;

  if (creativeVision) {
    prompt += `\n\nCreative director vision: ${creativeVision}. `;
  }

  if (sceneContext) {
    prompt += `\n\nScene context: ${sceneContext}. `;
  }

  return prompt;
}
