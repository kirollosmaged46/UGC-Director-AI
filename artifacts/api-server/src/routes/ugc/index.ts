import { Router } from "express";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { openai } from "@workspace/integrations-openai-ai-server";
import { editImages, type ImageEditSize } from "@workspace/integrations-openai-ai-server";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
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
  platform: z.enum(["tiktok", "instagram", "youtube"]).default("instagram"),
  creativeVision: z.string().max(2000).optional(),
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

function aspectRatioToSize(ratio: string): ImageEditSize {
  if (ratio === "9:16" || ratio === "4:5") return "1024x1536";
  if (ratio === "16:9") return "1536x1024";
  return "1024x1024";
}

function ffmpegDimensions(ratio: string): { w: number; h: number } {
  if (ratio === "9:16" || ratio === "4:5") return { w: 1024, h: 1536 };
  if (ratio === "16:9") return { w: 1536, h: 1024 };
  return { w: 1024, h: 1024 };
}

async function buildVideoFromKeyframes(
  keyframePaths: string[],
  outputPath: string,
  aspectRatio: string
): Promise<void> {
  const { w, h } = ffmpegDimensions(aspectRatio);
  const fps = 24;
  const clipDur = 4.5;
  const fadeDur = 0.5;
  const d = Math.round(fps * clipDur);

  const inputs: string[] = [];
  for (const kf of keyframePaths) {
    inputs.push("-loop", "1", "-t", String(clipDur + 1), "-i", kf);
  }

  const n = keyframePaths.length;

  const zoomDirections = [
    `z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
  ];

  const zpFilters = keyframePaths.map((_, i) =>
    `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=${zoomDirections[i] ?? zoomDirections[0]}:d=${d}:s=${w}x${h}:fps=${fps},setpts=PTS-STARTPTS[v${i}]`
  );

  let filterComplex: string;
  let mapLabel: string;

  if (n === 1) {
    filterComplex = zpFilters[0];
    mapLabel = "[v0]";
  } else if (n === 2) {
    const offset1 = clipDur - fadeDur;
    filterComplex = [
      zpFilters[0],
      zpFilters[1],
      `[v0][v1]xfade=transition=fade:duration=${fadeDur}:offset=${offset1}[vout]`,
    ].join(";");
    mapLabel = "[vout]";
  } else {
    const offset1 = clipDur - fadeDur;
    const offset2 = 2 * clipDur - 2 * fadeDur;
    filterComplex = [
      ...zpFilters,
      `[v0][v1]xfade=transition=fade:duration=${fadeDur}:offset=${offset1}[x1]`,
      `[x1][v2]xfade=transition=fade:duration=${fadeDur}:offset=${offset2}[vout]`,
    ].join(";");
    mapLabel = "[vout]";
  }

  await execFileAsync("ffmpeg", [
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", mapLabel,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "ultrafast",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ]);
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
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const tmpDir = os.tmpdir();
    const productPath = path.join(tmpDir, `ugc-product-${randomUUID()}.png`);
    await writeFile(productPath, imageBuffer);
    tmpFiles.push(productPath);

    if (contentType === "video") {
      const conceptResponse = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 800,
        messages: [
          {
            role: "user",
            content: `You are an expert UGC video director. Create a 3-scene video concept for an authentic UGC ad.

Ad angle: ${angle === "us-vs-them" ? "Us vs. Them — show why this product wins" : angle === "before-after" ? "Before & After — transformation narrative" : "Social Proof — real people love this product"}
Lighting: ${lighting}
Aspect ratio: ${aspectRatio}
Platform: ${platform}
Creative vision: ${creativeVision ?? "authentic lifestyle, real person energy"}

Rules:
- Each scene is 4-5 seconds
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
      });

      const raw = conceptResponse.choices[0]?.message?.content ?? "{}";
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
              creativeVision,
              sceneContext: scene.description,
            });
            const buf = await editImages([productPath], scenePrompt, undefined, aspectRatioToSize(aspectRatio));
            const kfPath = path.join(tmpDir, `ugc-kf-${randomUUID()}.png`);
            await writeFile(kfPath, buf);
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

      await buildVideoFromKeyframes(keyframePaths, videoPath, aspectRatio);

      const videoUrl = await videoStorage.uploadVideoAndGetUrl(videoPath);

      res.json({ images: [], videoUrl });
      return;
    }

    const generatedImages = [];
    for (let i = 0; i < count; i++) {
      const prompt = buildUgcPrompt({ angle, lighting, aspectRatio, platform, creativeVision });
      const editedBuffer = await editImages([productPath], prompt, undefined, aspectRatioToSize(aspectRatio));
      generatedImages.push({
        b64_json: editedBuffer.toString("base64"),
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

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are an elite UGC content strategist. Generate ${count} scroll-stopping hooks/captions for ${platformGuide}.

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
