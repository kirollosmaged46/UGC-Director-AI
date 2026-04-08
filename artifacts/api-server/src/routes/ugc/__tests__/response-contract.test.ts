import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

const PhotoResponseSchema = z.object({
  images: z.array(
    z.object({
      b64_json: z.string().min(1),
      index: z.number().int().min(0),
      aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]),
    })
  ),
});

const VideoResponseSchema = z.object({
  images: z.array(z.any()).length(0),
  videoUrl: z.string().url(),
});

describe("UGC generate response contract", () => {
  it("photo response shape is valid", () => {
    const photoResponse = {
      images: [
        { b64_json: "abc123base64data", index: 0, aspectRatio: "9:16" },
        { b64_json: "def456base64data", index: 1, aspectRatio: "9:16" },
      ],
    };
    const result = PhotoResponseSchema.safeParse(photoResponse);
    assert.ok(result.success, `Photo response schema failed: ${JSON.stringify(result.error?.flatten())}`);
  });

  it("video response shape is valid with non-empty videoUrl", () => {
    const videoResponse = {
      images: [],
      videoUrl: "https://storage.googleapis.com/bucket/ugc-videos/abc.mp4?X-Goog-Signature=xyz",
    };
    const result = VideoResponseSchema.safeParse(videoResponse);
    assert.ok(result.success, `Video response schema failed: ${JSON.stringify(result.error?.flatten())}`);
  });

  it("video response without videoUrl fails schema validation", () => {
    const incompleteVideoResponse = {
      images: [],
    };
    const result = VideoResponseSchema.safeParse(incompleteVideoResponse);
    assert.ok(!result.success, "Expected video response without videoUrl to fail schema validation");
  });

  it("photo response with wrong angle is rejected", () => {
    const wrongAngle = { id: "eye-level" };
    const AngleSchema = z.enum(["us-vs-them", "before-after", "social-proof"]);
    const result = AngleSchema.safeParse(wrongAngle.id);
    assert.ok(!result.success, "Legacy angle 'eye-level' should not be accepted");
  });

  it("all 3 ad angles are accepted by schema", () => {
    const AngleSchema = z.enum(["us-vs-them", "before-after", "social-proof"]);
    for (const angle of ["us-vs-them", "before-after", "social-proof"] as const) {
      const result = AngleSchema.safeParse(angle);
      assert.ok(result.success, `Angle '${angle}' should be accepted by schema`);
    }
  });
});
