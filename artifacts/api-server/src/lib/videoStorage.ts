import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { writeFileSync, unlinkSync } from "fs";
import { copyFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { logger } from "./logger.js";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const LOCAL_VIDEOS_DIR = join(process.cwd(), "data", "videos");

function buildGcsClient(): Storage {
  const credContent = JSON.stringify({
    type: "external_account",
    audience: "replit",
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  });
  const credPath = join(tmpdir(), `gcs-creds-${randomUUID()}.json`);
  writeFileSync(credPath, credContent, { mode: 0o600 });
  process.once("exit", () => {
    try { unlinkSync(credPath); } catch { /* ignore */ }
  });
  return new Storage({ keyFilename: credPath, projectId: "" });
}

export interface IVideoStorage {
  uploadVideoAndGetUrl(localPath: string): Promise<string>;
}

const gcs = buildGcsClient();

async function saveLocally(localPath: string): Promise<string> {
  await mkdir(LOCAL_VIDEOS_DIR, { recursive: true });
  const filename = `${randomUUID()}.mp4`;
  const destPath = join(LOCAL_VIDEOS_DIR, filename);
  await copyFile(localPath, destPath);
  logger.info({ destPath }, "Video saved locally (no object storage bucket configured)");
  return `/api/adgen/videos/${filename}`;
}

async function uploadToGcs(localPath: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
  const objectName = `ugc-videos/${randomUUID()}.mp4`;

  await gcs.bucket(bucketId).upload(localPath, {
    destination: objectName,
    contentType: "video/mp4",
    metadata: { cacheControl: "public, max-age=86400" },
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketId,
      object_name: objectName,
      method: "GET",
      expires_at: expiresAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get signed URL from object storage sidecar: ${response.status}`
    );
  }

  const { signed_url: signedUrl } = (await response.json()) as { signed_url: string };
  return signedUrl;
}

async function uploadVideoAndGetUrl(localPath: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    return saveLocally(localPath);
  }
  return uploadToGcs(localPath);
}

export const videoStorage: IVideoStorage = { uploadVideoAndGetUrl };
