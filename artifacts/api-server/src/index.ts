import { execFileSync } from "child_process";
import app from "./app";
import { logger } from "./lib/logger";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function validateEnvironment(): void {
  const missing: string[] = [];

  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
    missing.push("DEFAULT_OBJECT_STORAGE_BUCKET_ID");
  }

  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    logger.warn("ffmpeg not found in PATH — video generation will fail at runtime. " +
      "Ensure ffmpeg is available (provided via Nix in the Replit environment).");
  }

  if (missing.length > 0) {
    logger.warn(
      { missing },
      "Required environment variables for video generation are not set. " +
      "Provision object storage via the Replit Object Storage tool to enable video output."
    );
  }
}

async function probeSidecar(): Promise<void> {
  try {
    const res = await fetch(`${SIDECAR_ENDPOINT}/credential`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status },
        "Object storage sidecar responded with non-OK status — video upload may fail at runtime.");
    } else {
      logger.info("Object storage sidecar reachable");
    }
  } catch (err) {
    logger.warn({ err },
      "Object storage sidecar unreachable — video generation/upload will fail until the sidecar is available.");
  }
}

validateEnvironment();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void probeSidecar();
});
