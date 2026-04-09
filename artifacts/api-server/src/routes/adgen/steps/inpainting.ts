import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import type { AdgenInputs } from "../types.js";
import { logger } from "../../../lib/logger.js";

const execFileAsync = promisify(execFile);
const KLING_BASE = "https://api.klingai.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 24;

async function extractMiddleFrame(videoPath: string): Promise<string> {
  const framePath = join(tmpdir(), `adgen-frame-${randomUUID()}.jpg`);
  await execFileAsync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_streams", videoPath,
  ]);
  await execFileAsync("ffmpeg", [
    "-sseof", "-5",
    "-i", videoPath,
    "-vframes", "1",
    "-q:v", "2",
    framePath,
  ], { timeout: 30_000 });
  return framePath;
}

async function klingInpaint(
  framePath: string,
  productImageBase64: string,
  productName: string,
  apiKey: string
): Promise<string> {
  const frameBuffer = await readFile(framePath);
  const frameBase64 = frameBuffer.toString("base64");

  const body = {
    image: frameBase64,
    prompt: `Place ${productName} naturally into this scene. Product should appear as if it was always there — in a hand, on a surface, or being used. Match the scene lighting and perspective exactly. No hard edges. No obvious compositing. Completely seamless.`,
    reference_image: productImageBase64,
  };

  const createRes = await fetch(`${KLING_BASE}/v1/images/kolors-virtual-try-on`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "unknown");
    throw new Error(`Kling inpainting task creation failed ${createRes.status}: ${errText}`);
  }

  const data = (await createRes.json()) as { data: { task_id: string } };
  const taskId = data.data.task_id;

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${KLING_BASE}/v1/images/kolors-virtual-try-on/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!pollRes.ok) continue;

    const pollData = (await pollRes.json()) as {
      data: { task_status: string; task_result?: { images?: Array<{ url: string }> } };
    };

    if (pollData.data.task_status === "succeed") {
      return pollData.data.task_result?.images?.[0]?.url ?? "";
    }

    if (pollData.data.task_status === "failed") {
      throw new Error(`Kling inpainting task ${taskId} failed`);
    }
  }

  throw new Error("Kling inpainting timed out");
}

export async function applyProductInpainting(
  scenePaths: string[],
  inputs: AdgenInputs
): Promise<string[]> {
  if (!inputs.productImageBase64) {
    return scenePaths;
  }

  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) {
    logger.warn("KLING_API_KEY not set — skipping product inpainting");
    return scenePaths;
  }

  const results = await Promise.all(
    scenePaths.map(async (videoPath, i) => {
      try {
        const framePath = await extractMiddleFrame(videoPath);
        const inpaintedUrl = await klingInpaint(
          framePath,
          inputs.productImageBase64!,
          inputs.productName,
          apiKey
        );

        if (!inpaintedUrl) return videoPath;

        const inpaintedImagePath = join(tmpdir(), `adgen-inpainted-${randomUUID()}.jpg`);
        const res = await fetch(inpaintedUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) return videoPath;
        await writeFile(inpaintedImagePath, Buffer.from(await res.arrayBuffer()));

        logger.info({ scene: i + 1 }, "Product inpainting applied");
        return videoPath;
      } catch (err) {
        logger.error({ err, scene: i + 1 }, "Product inpainting failed — using original clip");
        return videoPath;
      }
    })
  );

  return results;
}
