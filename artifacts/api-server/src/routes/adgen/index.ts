import { Router } from "express";
import { createReadStream, existsSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { createJob, getJob } from "./queue.js";
import { runPipeline } from "./pipeline.js";
import { logger } from "../../lib/logger.js";
import { LOCAL_VIDEOS_DIR } from "../../lib/videoStorage.js";
import { AVATAR_PRESETS } from "./avatars.js";

const router = Router();

const AdgenGenerateBodySchema = z.object({
  productName: z.string().min(1),
  productCategory: z.string().min(1),
  productDescription: z.string().min(1),
  adAngle: z.enum(["us-vs-them", "before-after", "social-proof"]),
  platform: z.enum(["tiktok", "instagram-reels", "youtube-shorts"]),
  aspectRatio: z.enum(["9:16", "1:1", "4:5"]),
  videoDuration: z.enum(["15s", "30s", "60s"]).optional().default("30s"),
  selectedAvatarId: z.string().optional(),
  productImageBase64: z.string().optional(),
  referenceVideoBase64: z.string().optional(),
  creatorAvatarBase64: z.string().optional(),
  hookStyle: z
    .enum(["question", "bold-statement", "mid-action", "shocking-fact", "i-tried-this"])
    .optional(),
  voiceoverLanguage: z.enum(["english", "arabic"]).optional().default("english"),
  creativeVision: z.string().optional(),
});

router.post("/generate", async (req, res) => {
  try {
    const parsed = AdgenGenerateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const job = createJob(parsed.data);
    logger.info({ jobId: job.jobId }, "Ad generation job created");

    runPipeline(job).catch((err) => {
      logger.error({ err, jobId: job.jobId }, "Pipeline error (should not reach here)");
    });

    return res.json({ jobId: job.jobId });
  } catch (err) {
    logger.error({ err }, "Error creating adgen job");
    return res.status(500).json({ error: "Failed to start generation" });
  }
});

router.get("/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  return res.json({
    jobId: job.jobId,
    status: job.status,
    currentStep: job.currentStep,
    stepIndex: job.stepIndex,
    totalSteps: job.totalSteps,
    audioWarning: job.audioWarning,
    result: job.result,
  });
});

router.get("/avatars", (_req, res) => {
  return res.json({ avatars: AVATAR_PRESETS });
});

router.get("/videos/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[\w-]+\.mp4$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = join(LOCAL_VIDEOS_DIR, filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Video not found" });
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=3600");
  createReadStream(filePath).pipe(res);
});

router.post("/regenerate/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const original = getJob(jobId);

  if (!original) {
    return res.status(404).json({ error: "Original job not found" });
  }

  const newJob = createJob(original.inputs);
  logger.info({ originalJobId: jobId, newJobId: newJob.jobId }, "Regenerating ad");

  runPipeline(newJob).catch((err) => {
    logger.error({ err, jobId: newJob.jobId }, "Regeneration pipeline error");
  });

  return res.json({ jobId: newJob.jobId });
});

export default router;
