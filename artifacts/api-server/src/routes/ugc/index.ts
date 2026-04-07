import { Router } from "express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { editImages, type ImageEditSize } from "@workspace/integrations-openai-ai-server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

const router = Router();

const GenerateSchema = z.object({
  imageBase64: z.string().min(1, "imageBase64 is required").max(20_000_000, "image too large"),
  angle: z.enum(["eye-level", "overhead", "low-angle", "dutch-tilt", "close-up", "wide"]),
  lighting: z.enum(["golden-hour", "studio-white", "moody-dark", "outdoor-natural", "neon"]),
  aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]),
  count: z.number().int().min(1).max(3),
  // Note: "both" is not a valid server-side value. When the client wants both photo and
  // video_concept outputs, it issues two separate requests (one per contentType).
  contentType: z.enum(["photo", "video_concept"]),
  platform: z.enum(["tiktok", "instagram", "youtube"]).default("instagram"),
  creativeVision: z.string().max(2000).optional(),
});

const HooksSchema = z.object({
  productDescription: z.string().min(1).max(500),
  platform: z.enum(["tiktok", "instagram", "youtube"]),
  tone: z.string().max(100).default("authentic"),
  imageContext: z.string().max(2000).optional(),
});

const ModelHookSchema = z.object({ text: z.string().min(1), platform: z.string() });
const ModelHooksResponseSchema = z.object({ hooks: z.array(ModelHookSchema) });

const ModelConceptSchema = z.object({
  title: z.string().min(1),
  storyboard: z.string().min(1),
});

function aspectRatioToSize(ratio: string): ImageEditSize {
  if (ratio === "9:16" || ratio === "4:5") return "1024x1536";
  if (ratio === "16:9") return "1536x1024";
  return "1024x1024";
}

function buildUgcPrompt(params: {
  angle: string;
  lighting: string;
  aspectRatio: string;
  contentType: string;
  platform: string;
  creativeVision?: string;
}): string {
  const { angle, lighting, aspectRatio, contentType, platform, creativeVision } = params;

  const angleMap: Record<string, string> = {
    overhead: "overhead flat-lay shot looking straight down at the product",
    "eye-level": "eye-level shot, natural perspective as if held by a real person",
    "low-angle": "low-angle hero shot looking up at the product",
    "dutch-tilt": "slightly tilted Dutch tilt angle for dynamic visual energy",
    "close-up": "extreme close-up macro detail shot revealing product texture",
    wide: "wide environmental lifestyle shot with product as focal point",
  };

  const lightingMap: Record<string, string> = {
    "golden-hour": "warm golden hour sunlight, long soft shadows, natural outdoor warmth",
    "studio-white": "clean bright studio white lighting, crisp professional feel",
    "moody-dark": "moody low-key dramatic lighting, deep shadows, cinematic atmosphere",
    "outdoor-natural": "bright natural daylight, soft diffused outdoor ambience",
    neon: "vibrant neon accent lighting with colorful reflections, nightlife urban aesthetic",
  };

  const ratioMap: Record<string, string> = {
    "9:16": "vertical portrait 9:16 composition (TikTok/Reels)",
    "1:1": "square 1:1 composition",
    "4:5": "portrait 4:5 composition (Instagram feed)",
    "16:9": "landscape 16:9 composition (YouTube)",
  };

  const angleDesc = angleMap[angle] ?? angle;
  const lightingDesc = lightingMap[lighting] ?? lighting;
  const ratioDesc = ratioMap[aspectRatio] ?? aspectRatio;

  const platformContext =
    platform === "tiktok"
      ? "TikTok-native raw aesthetic, authentic Gen Z energy"
      : platform === "instagram"
      ? "Instagram-worthy, polished yet authentic lifestyle feel"
      : "YouTube Shorts ready, dynamic thumbnail-quality composition";

  let prompt = `Authentic UGC-style product photo. ${angleDesc}. ${lightingDesc}. Framed for ${ratioDesc}. ${platformContext}. `;
  prompt +=
    "The product should be prominently featured but in a genuine casual setting that feels completely real and unscripted. ";
  prompt +=
    "NOT stock photography. Feels like a real person shot this on their smartphone in a relatable real-world environment. ";
  prompt +=
    "High quality phone camera aesthetic with slight natural imperfections. No text overlays. No watermarks. ";

  if (creativeVision) {
    prompt += `Creative director vision: ${creativeVision}. `;
  }

  if (contentType === "video_concept") {
    prompt +=
      "This is a video keyframe — composition implies motion and dynamic storytelling.";
  }

  return prompt;
}

router.post("/generate", async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { imageBase64, angle, lighting, aspectRatio, count, contentType, platform, creativeVision } = parsed.data;
  const tmpFiles: string[] = [];

  try {
    if (contentType === "video_concept") {
      const imageBuffer = Buffer.from(imageBase64, "base64");
      const tmpDir = os.tmpdir();
      const tmpPath = path.join(tmpDir, `ugc-product-${Date.now()}.png`);
      await writeFile(tmpPath, imageBuffer);
      tmpFiles.push(tmpPath);

      const concepts = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const conceptResponse = await openai.chat.completions.create({
            model: "gpt-5.2",
            max_completion_tokens: 600,
            messages: [
              {
                role: "user",
                content: `You are an expert UGC video director. Create a specific video concept storyboard for a product shoot:

Camera angle: ${angle}
Lighting mood: ${lighting}
Aspect ratio: ${aspectRatio}
Platform: ${platform}
Creative vision: ${creativeVision ?? "authentic and genuine, feels like real UGC"}

Provide a 3-scene UGC video concept (each ~3-5 seconds). Optimize composition for ${aspectRatio} frame.

Format as valid JSON only: { "title": "short catchy video title max 8 words", "storyboard": "Scene 1: description\\n\\nScene 2: description\\n\\nScene 3: description" }`,
              },
            ],
          });

          const raw = conceptResponse.choices[0]?.message?.content ?? "{}";
          let concept: { title: string; storyboard: string };
          try {
            const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
            concept = ModelConceptSchema.parse(JSON.parse(cleaned));
          } catch {
            concept = { title: `UGC Video Concept ${i + 1}`, storyboard: raw };
          }

          const keyframePrompt =
            buildUgcPrompt({ angle, lighting, aspectRatio, contentType: "photo", platform, creativeVision }) +
            ` This is a keyframe still from a UGC video: ${concept.title}.`;
          const keyframeBuffer = await editImages([tmpPath], keyframePrompt, undefined, aspectRatioToSize(aspectRatio));

          return {
            concept: { ...concept, index: i },
            image: { b64_json: keyframeBuffer.toString("base64"), index: i },
          };
        })
      );

      res.json({
        images: concepts.map((c) => c.image),
        videoConcepts: concepts.map((c) => c.concept),
      });
      return;
    }

    const prompt = buildUgcPrompt({ angle, lighting, aspectRatio, contentType, platform, creativeVision });

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `ugc-product-${Date.now()}.png`);
    await writeFile(tmpPath, imageBuffer);
    tmpFiles.push(tmpPath);

    const generatedImages = [];
    for (let i = 0; i < count; i++) {
      const editedBuffer = await editImages([tmpPath], prompt, undefined, aspectRatioToSize(aspectRatio));
      generatedImages.push({
        b64_json: editedBuffer.toString("base64"),
        index: i,
        aspectRatio,
      });
    }

    res.json({ images: generatedImages, videoConcepts: [] });
  } catch (err) {
    req.log.error({ err }, "Failed to generate UGC content");
    res.status(500).json({ error: "Failed to generate UGC content" });
  } finally {
    for (const f of tmpFiles) {
      try {
        await unlink(f);
      } catch {
        // ignore cleanup errors
      }
    }
  }
});

router.post("/hooks", async (req, res) => {
  const parsed = HooksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { productDescription, platform, tone, imageContext } = parsed.data;

  try {
    const platformGuide =
      platform === "tiktok"
        ? "TikTok (punchy hooks, Gen Z voice, 'POV:', 'Tell me why...', 'You need this if...' formats work well)"
        : platform === "instagram"
        ? "Instagram Reels (lifestyle-focused, mix of curiosity + aspiration, slightly more polished than TikTok)"
        : "YouTube Shorts (value-driven, problem-solution framing, optimized for watch time)";

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are an elite UGC content strategist. Generate 5 scroll-stopping hooks/captions for ${platformGuide}.

Product: ${productDescription}
Tone: ${tone}
${imageContext ? `Visual context: ${imageContext}` : ""}

Rules:
- Each hook must feel authentic, like a real person talking — not a brand
- No corporate speak, no generic phrases, no buzzwords
- Mix formats: relatable pain points, surprising reveals, social proof angles, transformation hooks
- Each hook must be under 150 characters
- No emojis

Return ONLY valid JSON: { "hooks": [{ "text": "hook text here", "platform": "${platform}" }, ...] } with exactly 5 hooks.`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{"hooks":[]}';
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const validated = ModelHooksResponseSchema.parse(JSON.parse(cleaned));
      res.json(validated);
    } catch {
      req.log.warn({ raw }, "Failed to parse or validate hooks JSON from model; returning empty list");
      res.json({ hooks: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to generate hooks");
    res.status(500).json({ error: "Failed to generate hooks" });
  }
});

export default router;
