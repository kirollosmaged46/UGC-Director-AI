import { randomUUID } from "crypto";
import type { AdgenJob, AdgenInputs } from "./types.js";

const jobs = new Map<string, AdgenJob>();

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const JOB_TTL_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function createJob(inputs: AdgenInputs): AdgenJob {
  const jobId = randomUUID();
  const job: AdgenJob = {
    jobId,
    status: "queued",
    currentStep: "Queued",
    stepIndex: 0,
    totalSteps: 6,
    inputs,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): AdgenJob | undefined {
  return jobs.get(jobId);
}

export function updateJob(jobId: string, updates: Partial<AdgenJob>): void {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
  }
}
