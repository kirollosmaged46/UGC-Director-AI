import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import type { SceneScript, AdgenInputs } from "../types.js";
import { logger } from "../../../lib/logger.js";

const execFileAsync = promisify(execFile);

const KLING_BASE = "https://api.klingai.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 36; // 3 minutes

interface KlingTask {
  task_id: string;
  task_status: string;
  task_result?: {
    videos?: Array<{ url: string; duration: string }>;
  };
}

function buildKlingHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function buildScenePrompt(
  scene: SceneScript,
  inputs: AdgenInputs,
  hasRefVideo: boolean
): string {
  const parts = [
    "Authentic UGC smartphone video footage. Real person, real location, filmed on iPhone.",
    scene.visual,
  ];

  if (hasRefVideo) {
    parts.push("Match the visual style, energy, and authenticity level of the reference footage provided.");
  }

  if (inputs.productImageBase64) {
    parts.push(`The product ${inputs.productName} appears naturally in frame — held in hand, on surface, or in use.`);
  }

  parts.push(
    "Lighting: natural and imperfect — window light, lamp, outdoor shade. Never studio lighting.",
    "Camera: handheld, slight natural shake, real person energy. Slight imperfect framing.",
    "NOT stock footage. NOT studio shoot. NOT corporate ad. NOT AI-looking plastic skin.",
    "Real skin texture. Real background — slightly lived-in, slightly out of focus.",
    "No text overlays. No logos. No watermarks. No captions.",
    `Platform: ${inputs.platform}. Aspect ratio: ${inputs.aspectRatio}.`,
    `Emotion of this scene: ${scene.emotion}`
  );

  return parts.join(" ");
}

async function createKlingTask(
  scene: SceneScript,
  inputs: AdgenInputs,
  apiKey: string
): Promise<string> {
  const prompt = buildScenePrompt(scene, inputs, !!inputs.referenceVideoBase64);

  const aspectMap: Record<string, string> = {
    "9:16": "9:16",
    "1:1": "1:1",
    "4:5": "4:5",
  };

  const body: Record<string, unknown> = {
    prompt,
    duration: String(scene.duration_seconds),
    aspect_ratio: aspectMap[inputs.aspectRatio] ?? "9:16",
    cfg_scale: 0.5,
  };

  if (inputs.referenceVideoBase64) {
    body.reference_video = inputs.referenceVideoBase64;
  }

  const res = await fetch(`${KLING_BASE}/v1/videos/text2video`, {
    method: "POST",
    headers: buildKlingHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`Kling task creation failed ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { data: { task_id: string } };
  return data.data.task_id;
}

async function pollKlingTask(taskId: string, apiKey: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${KLING_BASE}/v1/videos/text2video/${taskId}`, {
      headers: buildKlingHeaders(apiKey),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn({ taskId, status: res.status }, "Kling poll error, retrying");
      continue;
    }

    const data = (await res.json()) as { data: KlingTask };
    const task = data.data;

    if (task.task_status === "succeed") {
      const videoUrl = task.task_result?.videos?.[0]?.url;
      if (!videoUrl) throw new Error("Kling task succeeded but no video URL");
      return videoUrl;
    }

    if (task.task_status === "failed") {
      throw new Error(`Kling task ${taskId} failed`);
    }
  }

  throw new Error(`Kling task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} polls`);
}

async function downloadVideo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buffer);
}

async function kenBurnsClip(
  scene: SceneScript,
  inputs: AdgenInputs,
  imagePath: string | null
): Promise<string> {
  const outputPath = join(tmpdir(), `adgen-scene-fallback-${randomUUID()}.mp4`);
  const duration = scene.duration_seconds;

  const aspectMap: Record<string, [number, number]> = {
    "9:16": [720, 1280],
    "1:1": [720, 720],
    "4:5": [720, 900],
  };
  const [w, h] = aspectMap[inputs.aspectRatio] ?? [720, 1280];

  const colorMap: Record<string, string> = {
    "us-vs-them": "0x1a1a2e",
    "before-after": "0x16213e",
    "social-proof": "0x0f3460",
  };
  const color = colorMap[inputs.adAngle] ?? "0x1a1a2e";

  const ffmpegArgs = imagePath
    ? [
        "-loop", "1",
        "-i", imagePath,
        "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.2)':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h},format=yuv420p`,
        "-t", String(duration),
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "fast",
        outputPath,
      ]
    : [
        "-f", "lavfi",
        "-i", `color=${color}:size=${w}x${h}:duration=${duration}:rate=25`,
        "-vf", "format=yuv420p",
        "-c:v", "libx264",
        "-crf", "23",
        outputPath,
      ];

  await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 120_000 });
  return outputPath;
}

async function generateSceneWithKling(
  scene: SceneScript,
  inputs: AdgenInputs,
  apiKey: string
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const taskId = await createKlingTask(scene, inputs, apiKey);
      const videoUrl = await pollKlingTask(taskId, apiKey);
      const outputPath = join(tmpdir(), `adgen-scene-${randomUUID()}.mp4`);
      await downloadVideo(videoUrl, outputPath);
      return outputPath;
    } catch (err) {
      logger.error({ err, scene: scene.scene_number, attempt }, "Kling scene attempt failed");
      lastError = err;
    }
  }
  throw lastError;
}

export async function generateScenes(
  scenes: SceneScript[],
  inputs: AdgenInputs
): Promise<string[]> {
  const apiKey = process.env.KLING_API_KEY;

  const productImagePath = inputs.productImageBase64
    ? await (async () => {
        const p = join(tmpdir(), `adgen-product-${randomUUID()}.jpg`);
        const buf = Buffer.from(inputs.productImageBase64!, "base64");
        await writeFile(p, buf);
        return p;
      })()
    : null;

  const results = await Promise.all(
    scenes.map(async (scene) => {
      if (!apiKey) {
        logger.warn({ scene: scene.scene_number }, "KLING_API_KEY not set — using Ken Burns fallback");
        return kenBurnsClip(scene, inputs, productImagePath);
      }

      try {
        return await generateSceneWithKling(scene, inputs, apiKey);
      } catch (err) {
        logger.error({ err, scene: scene.scene_number }, "Kling failed — falling back to Ken Burns");
        return kenBurnsClip(scene, inputs, productImagePath);
      }
    })
  );

  return results;
}
