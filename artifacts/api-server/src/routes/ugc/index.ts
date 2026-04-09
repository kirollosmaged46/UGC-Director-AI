import { Router } from "express";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import sharp from "sharp";
import { Modality } from "@google/genai";
import { ai } from "@workspace/integrations-gemini-ai";
import { videoStorage } from "../../lib/videoStorage";
import { AD_ANGLE_ENUM, type AdAngle, ModelConceptSchema, buildUgcPrompt } from "./helpers.js";

const execFileAsync = promisify(execFile);
const router = Router();

const GenerateSchema = z.object({
  imageBase64: z.string().min(1, "imageBase64 is required").max(20_000_000, "image too large"),
  angle: z.enum(AD_ANGLE_ENUM),
  lighting: z.enum(["golden-hour", "studio-white", "moody-dark", "outdoor-natural", "neon"]),
  aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]),
  count: z.number().int().min(1).max(3),
  contentType: z.enum(["photo", "video"]),
  platform: z.enum(["tiktok", "instagram", "youtube"]).default("tiktok"),
  productName: z.string().max(200).optional(),
  creativeVision: z.string().max(3000).optional(),
  videoDuration: z.number().int().min(5).max(60).optional().default(15),
  avatarEnabled: z.boolean().optional().default(false),
  avatarGender: z.enum(["male", "female"]).optional().default("female"),
  avatarStyle: z.enum(["casual", "professional", "streetwear", "sporty"]).optional().default("casual"),
  avatarEthnicity: z.string().max(50).optional().default("diverse"),
  avatarLanguage: z.string().max(30).optional().default("english"),
});

const ScriptsSchema = z.object({
  productName: z.string().min(1).max(200),
  productDescription: z.string().max(1000).optional(),
  platform: z.enum(["tiktok", "instagram", "youtube"]),
  angle: z.enum(AD_ANGLE_ENUM),
  count: z.number().int().min(1).max(5).default(5),
});

const HooksSchema = z.object({
  productDescription: z.string().min(1).max(500),
  platform: z.enum(["tiktok", "instagram", "youtube"]),
  tone: z.string().max(100).default("authentic"),
  imageContext: z.string().max(2000).optional(),
  count: z.number().int().min(3).max(5).default(5),
});

const ModelHookSchema = z.object({ text: z.string().min(1), platform: z.string() });
const ModelHooksResponseSchema = z.object({ hooks: z.array(ModelHookSchema) });

function ffmpegDimensions(ratio: string): { w: number; h: number } {
  if (ratio === "9:16" || ratio === "4:5") return { w: 1024, h: 1536 };
  if (ratio === "16:9") return { w: 1536, h: 1024 };
  return { w: 1024, h: 1024 };
}

async function normalizeToRgbaPng(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .ensureAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function generateUgcImage(
  productBase64: string,
  prompt: string,
): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: productBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
      maxOutputTokens: 8192,
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData,
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data returned from Gemini");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

// Ken Burns zoom directions — safe values that stay within frame bounds
const ZOOM_DIRECTIONS = [
  `z='min(zoom+0.0015,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
  `z='min(zoom+0.0015,1.2)':x='0':y='0'`,
  `z='min(zoom+0.0015,1.2)':x='iw/2-(iw/zoom/2)':y='0'`,
];

async function buildVideoFromKeyframes(
  keyframePaths: string[],
  outputPath: string,
  aspectRatio: string,
  totalDuration = 15
): Promise<void> {
  const { w, h } = ffmpegDimensions(aspectRatio);
  const fps = 24;
  const n = keyframePaths.length;
  const clipDur = parseFloat((totalDuration / n).toFixed(2));
  const d = Math.round(fps * clipDur);
  const tmpDir = path.dirname(outputPath);
  const clipPaths: string[] = [];

  for (let i = 0; i < n; i++) {
    const clipPath = path.join(tmpDir, `ugc-clip-${i}-${randomUUID()}.mp4`);
    const zoomDir = ZOOM_DIRECTIONS[i % ZOOM_DIRECTIONS.length];
    await execFileAsync("ffmpeg", [
      "-framerate", String(fps),
      "-loop", "1",
      "-t", String(clipDur),
      "-i", keyframePaths[i],
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=${zoomDir}:d=${d}:s=${w}x${h}:fps=${fps},fps=${fps}`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "ultrafast",
      "-r", String(fps),
      "-y",
      clipPath,
    ]);
    clipPaths.push(clipPath);
  }

  const concatList = clipPaths.map((p) => `file '${p}'`).join("\n");
  const concatFile = path.join(tmpDir, `ugc-concat-${randomUUID()}.txt`);
  await writeFile(concatFile, concatList);

  try {
    await execFileAsync("ffmpeg", [
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-c", "copy",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);
  } finally {
    for (const p of [...clipPaths, concatFile]) {
      try { await unlink(p); } catch { /* ignore */ }
    }
  }
}

router.post("/generate", async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const {
    imageBase64, angle, lighting, aspectRatio, count, contentType, platform,
    productName, creativeVision, videoDuration,
    avatarEnabled, avatarGender, avatarStyle, avatarEthnicity, avatarLanguage,
  } = parsed.data;

  const avatarContext = avatarEnabled
    ? `\nAVATAR CREATOR: ${avatarGender}, ${avatarEthnicity} ethnicity, ${avatarStyle} style, ${avatarLanguage}-speaking creator. The avatar is a photorealistic real-looking person who appears to be holding and presenting the product directly to camera. Their face, hands, arms, and clothing must be visible and natural. They look like a genuine UGC creator — not a model, not a stock photo person.`
    : "";
  const tmpFiles: string[] = [];

  try {
    const rawBuffer = Buffer.from(imageBase64, "base64");
    const pngBuffer = await normalizeToRgbaPng(rawBuffer);
    const productBase64 = pngBuffer.toString("base64");
    const tmpDir = os.tmpdir();

    if (contentType === "video") {
      const conceptResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are an expert UGC video director. Create a 3-scene video concept for an authentic UGC ad.

Ad angle: ${angle === "us-vs-them" ? "Us vs. Them — show why this product wins" : angle === "before-after" ? "Before & After — transformation narrative" : "Social Proof — real people love this product"}
Lighting: ${lighting}
Aspect ratio: ${aspectRatio}
Platform: ${platform}
Product: ${productName ?? "this product"}
Creative vision: ${creativeVision ?? "authentic lifestyle, real person energy"}${avatarContext}

Rules:
- Each scene is ${Math.round(videoDuration / 3)} seconds
- Scenes build a narrative arc matching the ad angle
- Feel like real UGC shot by a genuine user, not a brand shoot
- No text overlays, no graphics — pure visual storytelling

Return ONLY valid JSON:
{
  "title": "short catchy video title max 8 words",
  "scenes": [
    { "description": "Scene 1: detailed visual description of what the camera sees" },
    { "description": "Scene 2: detailed visual description" },
    { "description": "Scene 3: detailed visual description and payoff" }
  ]
}`,
              },
            ],
          },
        ],
        config: { maxOutputTokens: 8192 },
      });

      const raw = conceptResponse.text ?? "{}";
      let concept: z.infer<typeof ModelConceptSchema>;
      try {
        const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
        concept = ModelConceptSchema.parse(JSON.parse(cleaned));
      } catch {
        concept = {
          title: "Authentic UGC Video",
          scenes: [
            { description: "Opening scene with product in hand, natural lighting" },
            { description: "Close detail shot showing product quality and texture" },
            { description: "Lifestyle payoff moment — product in use, genuine reaction" },
          ],
        };
      }

      const keyframePaths: string[] = new Array<string>(concept.scenes.length);
      try {
        await Promise.all(
          concept.scenes.map(async (scene, i) => {
            const scenePrompt = buildUgcPrompt({
              angle,
              lighting,
              aspectRatio,
              platform,
              productName,
              creativeVision: (creativeVision ?? "") + avatarContext,
              sceneContext: scene.description,
            });
            const imgBuffer = await generateUgcImage(productBase64, scenePrompt);
            const kfPath = path.join(tmpDir, `ugc-kf-${randomUUID()}.png`);
            await writeFile(kfPath, imgBuffer);
            tmpFiles.push(kfPath);
            keyframePaths[i] = kfPath;
          })
        );
      } catch (err) {
        req.log.error({ err }, "Keyframe generation error");
        throw err;
      }

      const videoPath = path.join(tmpDir, `ugc-video-${randomUUID()}.mp4`);
      tmpFiles.push(videoPath);

      await buildVideoFromKeyframes(keyframePaths, videoPath, aspectRatio, videoDuration);

      const videoUrl = await videoStorage.uploadVideoAndGetUrl(videoPath);

      res.json({ images: [], videoUrl });
      return;
    }

    const generatedImages = [];
    for (let i = 0; i < count; i++) {
      const prompt = buildUgcPrompt({ angle, lighting, aspectRatio, platform, productName, creativeVision: (creativeVision ?? "") + avatarContext });
      const imgBuffer = await generateUgcImage(productBase64, prompt);
      generatedImages.push({
        b64_json: imgBuffer.toString("base64"),
        index: i,
        aspectRatio,
      });
    }

    res.json({ images: generatedImages });
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

  const { productDescription, platform, tone, imageContext, count } = parsed.data;

  try {
    const platformGuide =
      platform === "tiktok"
        ? "TikTok (punchy hooks, Gen Z voice, 'POV:', 'Tell me why...', 'You need this if...' formats work well)"
        : platform === "instagram"
        ? "Instagram Reels (lifestyle-focused, mix of curiosity + aspiration, slightly more polished than TikTok)"
        : "YouTube Shorts (value-driven, problem-solution framing, optimized for watch time)";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an elite UGC content strategist. Generate ${count} scroll-stopping hooks/captions for ${platformGuide}.

Product: ${productDescription}
Tone: ${tone}
${imageContext ? `Visual context: ${imageContext}` : ""}

Rules:
- Each hook must feel authentic, like a real person talking — not a brand
- No corporate speak, no generic phrases, no buzzwords
- Mix formats: relatable pain points, surprising reveals, social proof angles, transformation hooks
- Each hook must be under 150 characters
- No emojis

Return ONLY valid JSON: { "hooks": [{ "text": "hook text here", "platform": "${platform}" }, ...] } with exactly ${count} hooks.`,
            },
          ],
        },
      ],
      config: { maxOutputTokens: 8192 },
    });

    const raw = response.text ?? '{"hooks":[]}';
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const validated = ModelHooksResponseSchema.parse(JSON.parse(cleaned));
      res.json(validated);
    } catch {
      req.log.warn({ raw }, "Failed to parse or validate hooks JSON from Gemini; returning empty list");
      res.json({ hooks: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to generate hooks");
    res.status(500).json({ error: "Failed to generate hooks" });
  }
});

router.post("/scripts", async (req, res) => {
  const parsed = ScriptsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { productName, productDescription, platform, angle, count } = parsed.data;

  const angleGuide =
    angle === "us-vs-them"
      ? "Us vs. Them — the creator tried the old way and is done with it. Script opens with the pain of the 'old way', then the switch moment, then the undeniable result."
      : angle === "before-after"
      ? "Before & After — real before-state (a genuine problem moment), then the product as quiet catalyst, then the after feeling. Emotion carries it."
      : "Social Proof / Unboxing — genuine surprise or quiet satisfaction. Real person, real moment. One specific personal detail that makes it feel real.";

  const platformGuide =
    platform === "tiktok"
      ? "TikTok: Gen Z voice, punchy, lowercase where natural, feels like one take on a phone. Hook must be the first sentence — no intro, no 'hey guys'."
      : platform === "instagram"
      ? "Instagram Reels: slightly more composed than TikTok but still organic. Warm, aspirational, personal. Lifestyle creator energy."
      : "YouTube Shorts: value-driven, problem-solution, slightly longer sentences. Optimized for watch time.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an elite UGC ad scriptwriter. Generate ${count} distinct script options for the following product.

PRODUCT: ${productName}
${productDescription ? `DESCRIPTION: ${productDescription}` : ""}

PLATFORM: ${platformGuide}

AD ANGLE: ${angleGuide}

AUTHENTICITY RULES:
- Every script must sound like a real person talking, not a brand
- Hook must stop the scroll in 0.3 seconds — surprising, relatable, or uncomfortable
- No corporate language, no buzzwords, no "game-changer", no "revolutionary"
- Dialogue must sound like texting out loud, not a script
- CTA must be casual and first-person — never "click the link below" or "buy now"
- Would a real 22-year-old post this? If no — rewrite it

Return ONLY valid JSON in this exact format:
{
  "scripts": [
    {
      "hook": "The exact opening line — max 15 words, scroll-stopping",
      "body": "The main message — 2-4 sentences, conversational, platform-native",
      "cta": "The closing call to action — casual, first-person, max 10 words",
      "platform": "${platform}"
    }
  ]
}

Generate exactly ${count} distinct scripts with different hooks and angles. No two should feel the same.`,
            },
          ],
        },
      ],
      config: { maxOutputTokens: 8192 },
    });

    const raw = response.text ?? '{"scripts":[]}';
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const parsedJson = JSON.parse(cleaned) as { scripts: Array<{ hook: string; body: string; cta: string; platform: string }> };
      res.json({ scripts: parsedJson.scripts ?? [] });
    } catch {
      req.log.warn({ raw }, "Failed to parse scripts JSON from Gemini");
      res.json({ scripts: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to generate scripts");
    res.status(500).json({ error: "Failed to generate scripts" });
  }
});

export default router;
