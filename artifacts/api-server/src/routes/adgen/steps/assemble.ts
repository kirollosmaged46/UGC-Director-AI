import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../../../lib/logger.js";
import { videoStorage } from "../../../lib/videoStorage.js";

const execFileAsync = promisify(execFile);

async function normalizeClip(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-vf", "scale=720:-2",
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-an",
    outputPath,
  ], { timeout: 120_000 });
}

export async function assembleVideo(
  scenePaths: string[],
  audioPath: string | null
): Promise<string> {
  const workDir = tmpdir();
  const finalOutput = join(workDir, `adgen-final-${randomUUID()}.mp4`);

  const normalizedPaths = await Promise.all(
    scenePaths.map(async (p, i) => {
      const norm = join(workDir, `adgen-norm-${i}-${randomUUID()}.mp4`);
      await normalizeClip(p, norm);
      return norm;
    })
  );

  let assembled: string;

  if (normalizedPaths.length === 1) {
    assembled = normalizedPaths[0];
  } else {
    assembled = join(workDir, `adgen-assembled-${randomUUID()}.mp4`);

    let current = normalizedPaths[0];
    for (let i = 1; i < normalizedPaths.length; i++) {
      const next = normalizedPaths[i];
      const merged = join(workDir, `adgen-merge-${i}-${randomUUID()}.mp4`);

      await execFileAsync("ffmpeg", [
        "-i", current,
        "-i", next,
        "-filter_complex",
        `[0][1]xfade=transition=fade:duration=0.3:offset=${i === 1 ? 2.7 : (i * 4) - 0.3}[v]`,
        "-map", "[v]",
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "fast",
        merged,
      ], { timeout: 180_000 });

      current = merged;
    }

    assembled = current;
  }

  if (audioPath) {
    const withAudio = join(workDir, `adgen-audio-${randomUUID()}.mp4`);
    await execFileAsync("ffmpeg", [
      "-i", assembled,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-af", "loudnorm",
      "-shortest",
      "-map", "0:v:0",
      "-map", "1:a:0",
      withAudio,
    ], { timeout: 180_000 });
    assembled = withAudio;
  }

  await execFileAsync("ffmpeg", [
    "-i", assembled,
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "fast",
    "-movflags", "+faststart",
    finalOutput,
  ], { timeout: 180_000 });

  logger.info({ finalOutput }, "Video assembled, uploading to storage");

  const signedUrl = await videoStorage.uploadVideoAndGetUrl(finalOutput);
  logger.info({ signedUrl }, "Video uploaded to object storage");

  for (const p of normalizedPaths) {
    unlink(p).catch(() => {});
  }
  unlink(finalOutput).catch(() => {});

  return signedUrl;
}
