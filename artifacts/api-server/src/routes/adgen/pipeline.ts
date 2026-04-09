import type { AdgenJob } from "./types.js";
import { updateJob } from "./queue.js";
import { generateScript } from "./steps/script.js";
import { generateVoiceover } from "./steps/voiceover.js";
import { generateScenes } from "./steps/kling.js";
import { applyProductInpainting } from "./steps/inpainting.js";
import { assembleVideo } from "./steps/assemble.js";
import { logger } from "../../lib/logger.js";

const STEPS = [
  "Writing script...",
  "Generating voiceover...",
  "Generating video scenes...",
  "Adding product to scenes...",
  "Assembling final video...",
  "Done ✓",
];

function setStep(jobId: string, stepIndex: number): void {
  updateJob(jobId, {
    currentStep: STEPS[stepIndex] ?? STEPS[STEPS.length - 1],
    stepIndex,
    status: "running",
  });
}

export async function runPipeline(job: AdgenJob): Promise<void> {
  const { jobId, inputs } = job;
  logger.info({ jobId }, "Pipeline starting");

  try {
    setStep(jobId, 0);
    const script = await generateScript(inputs);
    logger.info({ jobId, hook: script.hook }, "Script generated");

    setStep(jobId, 1);
    const { audioPath, warning: audioWarning } = await generateVoiceover(script, inputs);
    if (audioWarning) {
      updateJob(jobId, { audioWarning });
    }

    setStep(jobId, 2);
    const scenePaths = await generateScenes(script.scenes, inputs);
    logger.info({ jobId, sceneCount: scenePaths.length }, "Scenes generated");

    setStep(jobId, 3);
    const processedPaths = await applyProductInpainting(scenePaths, inputs);

    setStep(jobId, 4);
    const videoUrl = await assembleVideo(processedPaths, audioPath);
    logger.info({ jobId, videoUrl }, "Video assembled and uploaded");

    setStep(jobId, 5);
    updateJob(jobId, {
      status: "done",
      result: {
        videoUrl,
        hook: script.hook,
        hookVariants: script.hook_variants,
        caption: script.caption,
        script,
      },
    });

    logger.info({ jobId }, "Pipeline complete");
  } catch (err) {
    logger.error({ err, jobId }, "Pipeline failed");
    updateJob(jobId, {
      status: "failed",
      currentStep: "Generation failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
