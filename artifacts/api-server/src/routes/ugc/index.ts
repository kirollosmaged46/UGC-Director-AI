import { Router } from "express";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import sharp from "sharp";
import { videoStorage } from "../../lib/videoStorage";
import { AD_ANGLE_ENUM, type AdAngle, ModelConceptSchema, buildUgcPrompt } from "./helpers.js";

const execFileAsync = promisify(execFile);
const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function ffmpegDimensions(ratio: string): { w: number; h: number } {
  if (ratio === "9:16" || ratio === "4:5") return { w: 1024, h: 1536 };
  if (ratio === "16:9") return { w: 1536, h: 1024 };
  return { w: 1024, h: 1024 };
}

async function normalizeToRgbaPng(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer).ensureAlpha().png({ compressionLevel: 6 }).toBuffer();
}

// ─── Gemini helpers (direct REST, no SDK import to avoid bundling issues) ───

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

async function geminiGenerateText(model: string, prompt: string): Promise<string> {
  const url = `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${geminiKey()}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini text generation failed: ${resp.status} ${err}`);
  }
  const json = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return json.candidates?.[0]?.content?.parts?.find(p => p.text)?.text ?? "";
}

async function geminiGenerateImage(
  model: string,
  prompt: string,
  imagePngBase64: string
): Promise<Buffer> {
  const url = `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${geminiKey()}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "image/png", data: imagePngBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      maxOutputTokens: 8192,
    },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini image generation failed: ${resp.status} ${err}`);
  }
  const json = await resp.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>
  };
  const imagePart = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data returned from Gemini image model");
  }
  return Buffer.from(imagePart.inlineData.data, "base64");
}

// ─── Veo 3 video generation ──────────────────────────────────────────────────

async function generateVeo3Video(
  prompt: string,
  aspectRatio: string,
  durationSeconds: number
): Promise<Buffer> {
  const key = geminiKey();

  // Map aspect ratio to Veo accepted values
  const veoAspectRatio =
    aspectRatio === "9:16" ? "9:16"
    : aspectRatio === "16:9" ? "16:9"
    : aspectRatio === "1:1" ? "1:1"
    : "9:16"; // default for 4:5

  // Clamp duration: Veo 3 supports 5–8 seconds per clip
  const clampedDuration = Math.min(8, Math.max(5, durationSeconds));

  // Start generation
  const startUrl = `${GEMINI_BASE}/v1beta/models/veo-3.0-generate-preview:predictLongRunning?key=${key}`;
  const startBody = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio: veoAspectRatio,
      durationSeconds: clampedDuration,
      numberOfVideos: 1,
      enhancePrompt: true,
      generateAudio: true,
    },
  };

  const startResp = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startBody),
  });

  if (!startResp.ok) {
    const err = await startResp.text();
    throw new Error(`Veo 3 start failed: ${startResp.status} ${err}`);
  }

  const operation = await startResp.json() as { name?: string; done?: boolean; response?: { videos?: Array<{ uri?: string; bytesBase64Encoded?: string }> }; error?: { message: string } };
  const opName = operation.name;
  if (!opName) throw new Error("Veo 3: no operation name returned");

  // Poll until done (max 5 minutes)
  const pollUrl = `${GEMINI_BASE}/v1beta/${opName}?key=${key}`;
  const deadline = Date.now() + 5 * 60 * 1000;

  let result = operation;
  while (!result.done) {
    if (Date.now() > deadline) throw new Error("Veo 3 generation timed out after 5 minutes");
    await new Promise(r => setTimeout(r, 10_000));
    const pollResp = await fetch(pollUrl, { headers: { "Content-Type": "application/json" } });
    if (!pollResp.ok) {
      const err = await pollResp.text();
      throw new Error(`Veo 3 poll failed: ${pollResp.status} ${err}`);
    }
    result = await pollResp.json() as typeof result;
  }

  if (result.error) throw new Error(`Veo 3 generation error: ${result.error.message}`);

  const videos = result.response?.videos;
  if (!videos?.length) throw new Error("Veo 3: no videos in response");

  const video = videos[0];

  // Prefer inline base64 data; fall back to URI download
  if (video.bytesBase64Encoded) {
    return Buffer.from(video.bytesBase64Encoded, "base64");
  }

  if (video.uri) {
    const dlResp = await fetch(`${video.uri}&key=${key}`);
    if (!dlResp.ok) throw new Error(`Veo 3 video download failed: ${dlResp.status}`);
    return Buffer.from(await dlResp.arrayBuffer());
  }

  throw new Error("Veo 3: video has neither bytesBase64Encoded nor uri");
}

// ─── FFmpeg Ken Burns (fallback when Veo 3 not used for all content) ─────────

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
      "-framerate", String(fps), "-loop", "1", "-t", String(clipDur),
      "-i", keyframePaths[i],
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=${zoomDir}:d=${d}:s=${w}x${h}:fps=${fps},fps=${fps}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
      "-r", String(fps), "-y", clipPath,
    ]);
    clipPaths.push(clipPath);
  }

  const concatList = clipPaths.map(p => `file '${p}'`).join("\n");
  const concatFile = path.join(tmpDir, `ugc-concat-${randomUUID()}.txt`);
  await writeFile(concatFile, concatList);
  try {
    await execFileAsync("ffmpeg", [
      "-f", "concat", "-safe", "0", "-i", concatFile,
      "-c", "copy", "-movflags", "+faststart", "-y", outputPath,
    ]);
  } finally {
    for (const p of [...clipPaths, concatFile]) {
      try { await unlink(p); } catch { /* ignore */ }
    }
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

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
    ? `\nAVATAR CREATOR: ${avatarGender}, ${avatarEthnicity} ethnicity, ${avatarStyle} style, ${avatarLanguage}-speaking creator. The avatar is a photorealistic real-looking person holding and presenting the product directly to camera. Their face, hands, arms, and clothing must be visible and natural. They look like a genuine UGC creator — not a model, not a stock photo person.`
    : "";

  const tmpFiles: string[] = [];

  try {
    const rawBuffer = Buffer.from(imageBase64, "base64");
    const pngBuffer = await normalizeToRgbaPng(rawBuffer);
    const productBase64 = pngBuffer.toString("base64");
    const tmpDir = os.tmpdir();

    if (contentType === "video") {
      // Step 1: generate a UGC-style image keyframe with Gemini image model
      const imagePrompt = buildUgcPrompt({
        angle, lighting, aspectRatio, platform, productName,
        creativeVision: (creativeVision ?? "") + avatarContext,
      });

      const keyframeBuffer = await geminiGenerateImage(
        "gemini-2.5-flash-preview-05-20",
        imagePrompt,
        productBase64
      );
      const kfPath = path.join(tmpDir, `ugc-kf-${randomUUID()}.png`);
      await writeFile(kfPath, keyframeBuffer);
      tmpFiles.push(kfPath);

      // Step 2: build a rich Veo 3 prompt from the UGC context
      const angleDesc =
        angle === "us-vs-them" ? "comparison showing why this product wins over alternatives"
        : angle === "before-after" ? "before-and-after transformation narrative"
        : "authentic social proof and unboxing moment";

      const veoPrompt = [
        `Authentic UGC-style short video ad for ${productName ?? "a product"}.`,
        `Ad angle: ${angleDesc}.`,
        `Lighting: ${lighting.replace("-", " ")}.`,
        `Platform: ${platform} — feel like real content filmed on a smartphone, slightly imperfect, one-take energy.`,
        creativeVision ? `Creative direction: ${creativeVision}.` : "",
        avatarEnabled
          ? `A real-looking ${avatarGender} creator of ${avatarEthnicity} ethnicity, ${avatarStyle} style, ${avatarLanguage}-speaking, holds and presents the product to camera naturally. Face, hands, and clothing visible.`
          : "Product held naturally in frame with hands/forearms visible.",
        "No text overlays. No studio backdrop. No corporate staging. Lived-in real setting.",
        "Cinematic quality but genuine creator energy.",
      ].filter(Boolean).join(" ");

      // Step 3: generate video with Veo 3
      const videoBuffer = await generateVeo3Video(veoPrompt, aspectRatio, videoDuration);

      const videoPath = path.join(tmpDir, `ugc-video-${randomUUID()}.mp4`);
      await writeFile(videoPath, videoBuffer);
      tmpFiles.push(videoPath);

      const videoUrl = await videoStorage.uploadVideoAndGetUrl(videoPath);
      res.json({ images: [], videoUrl });
      return;
    }

    // Photo generation
    const generatedImages = [];
    for (let i = 0; i < count; i++) {
      const prompt = buildUgcPrompt({
        angle, lighting, aspectRatio, platform, productName,
        creativeVision: (creativeVision ?? "") + avatarContext,
      });
      const imgBuffer = await geminiGenerateImage(
        "gemini-2.5-flash-preview-05-20",
        prompt,
        productBase64
      );
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
      try { await unlink(f); } catch { /* ignore */ }
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
        ? "TikTok (punchy hooks, Gen Z voice, 'POV:', 'Tell me why...', 'You need this if...' formats)"
        : platform === "instagram"
        ? "Instagram Reels (lifestyle-focused, curiosity + aspiration, slightly more polished than TikTok)"
        : "YouTube Shorts (value-driven, problem-solution framing, optimized for watch time)";

    const raw = await geminiGenerateText(
      "gemini-2.5-pro",
      `You are an elite UGC content strategist. Generate ${count} scroll-stopping hooks/captions for ${platformGuide}.

Product: ${productDescription}
Tone: ${tone}
${imageContext ? `Visual context: ${imageContext}` : ""}

Rules:
- Each hook must feel authentic, like a real person talking — not a brand
- No corporate speak, no generic phrases, no buzzwords
- Mix formats: relatable pain points, surprising reveals, social proof angles, transformation hooks
- Each hook must be under 150 characters
- No emojis

Return ONLY valid JSON: { "hooks": [{ "text": "hook text here", "platform": "${platform}" }, ...] } with exactly ${count} hooks.`
    );

    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const validated = ModelHooksResponseSchema.parse(JSON.parse(cleaned));
      res.json(validated);
    } catch {
      req.log.warn({ raw }, "Failed to parse hooks JSON");
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
    const raw = await geminiGenerateText(
      "gemini-2.5-pro",
      `You are an elite UGC ad scriptwriter. Generate ${count} distinct script options for the following product.

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

Generate exactly ${count} distinct scripts with different hooks and angles. No two should feel the same.`
    );

    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const parsedJson = JSON.parse(cleaned) as { scripts: Array<{ hook: string; body: string; cta: string; platform: string }> };
      res.json({ scripts: parsedJson.scripts ?? [] });
    } catch {
      req.log.warn({ raw }, "Failed to parse scripts JSON");
      res.json({ scripts: [] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to generate scripts");
    res.status(500).json({ error: "Failed to generate scripts" });
  }
});

export default router;
