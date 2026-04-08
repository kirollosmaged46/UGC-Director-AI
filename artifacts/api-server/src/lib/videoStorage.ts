import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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
  const client = new Storage({ keyFilename: credPath, projectId: "" });
  try {
    unlinkSync(credPath);
  } catch {
    // File cleanup is best-effort; the client has already read the credentials
  }
  return client;
}

const gcs = buildGcsClient();

export async function uploadVideoAndGetUrl(localPath: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — run object storage setup");
  }

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
