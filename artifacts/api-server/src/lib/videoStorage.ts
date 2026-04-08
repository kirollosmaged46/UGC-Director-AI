import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const gcsCredentials = {
  audience: "replit",
  subject_token_type: "access_token",
  token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
  type: "external_account",
  credential_source: {
    url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
    format: {
      type: "json",
      subject_token_field_name: "access_token",
    },
  },
  universe_domain: "googleapis.com",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gcs = new Storage({ credentials: gcsCredentials as any, projectId: "" });

export async function uploadVideoAndGetUrl(localPath: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — run object storage setup");

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
    throw new Error(`Failed to get signed URL: ${response.status}`);
  }

  const { signed_url: signedUrl } = (await response.json()) as { signed_url: string };
  return signedUrl;
}
