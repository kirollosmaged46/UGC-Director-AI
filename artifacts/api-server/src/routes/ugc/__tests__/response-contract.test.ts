import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AD_ANGLE_ENUM, ModelConceptSchema, buildUgcPrompt, buildAngleNarrative } from "../helpers.js";

describe("UGC generate — ad angle helpers", () => {
  it("all 3 ad angles are accepted by the enum", () => {
    const AngleSchema = z.enum(AD_ANGLE_ENUM);
    for (const angle of AD_ANGLE_ENUM) {
      const result = AngleSchema.safeParse(angle);
      assert.ok(result.success, `Angle '${angle}' should be valid`);
    }
  });

  it("legacy camera angle is rejected by enum", () => {
    const AngleSchema = z.enum(AD_ANGLE_ENUM);
    assert.ok(!AngleSchema.safeParse("eye-level").success, "Legacy angle 'eye-level' should be rejected");
    assert.ok(!AngleSchema.safeParse("overhead").success, "Legacy angle 'overhead' should be rejected");
  });

  it("buildAngleNarrative returns unique content per angle", () => {
    const narratives = AD_ANGLE_ENUM.map((a) => buildAngleNarrative(a));
    const uniqueNarratives = new Set(narratives);
    assert.equal(uniqueNarratives.size, 3, "Each angle should have a unique narrative");
  });

  it("buildUgcPrompt includes angle narrative and platform cues", () => {
    for (const angle of AD_ANGLE_ENUM) {
      const prompt = buildUgcPrompt({
        angle,
        lighting: "golden-hour",
        aspectRatio: "9:16",
        platform: "tiktok",
      });
      assert.ok(prompt.length > 100, `Prompt for '${angle}' should be non-trivial`);
      assert.ok(prompt.includes("UGC"), `Prompt for '${angle}' should mention UGC`);
      assert.ok(prompt.includes("Ad angle"), `Prompt for '${angle}' should include angle narrative header`);
    }
  });

  it("buildUgcPrompt appends creativeVision and sceneContext when provided", () => {
    const prompt = buildUgcPrompt({
      angle: "social-proof",
      lighting: "studio-white",
      aspectRatio: "1:1",
      platform: "instagram",
      creativeVision: "Make it pop",
      sceneContext: "Kitchen scene with friends",
    });
    assert.ok(prompt.includes("Make it pop"), "Prompt should include creativeVision");
    assert.ok(prompt.includes("Kitchen scene"), "Prompt should include sceneContext");
  });
});

describe("UGC generate — ModelConceptSchema", () => {
  it("accepts a valid 3-scene concept", () => {
    const concept = {
      title: "Before & After Glow Up",
      scenes: [
        { description: "Close-up of tired morning face, no product in sight" },
        { description: "Person discovering the product on bathroom counter" },
        { description: "Radiant confident person holding up the product" },
      ],
    };
    const result = ModelConceptSchema.safeParse(concept);
    assert.ok(result.success, `Valid concept should parse: ${JSON.stringify(result.error?.flatten())}`);
  });

  it("rejects concepts with fewer than 3 scenes", () => {
    const concept = {
      title: "Too Short",
      scenes: [{ description: "Only one scene" }, { description: "Two scenes" }],
    };
    assert.ok(!ModelConceptSchema.safeParse(concept).success, "2-scene concept should be rejected");
  });

  it("rejects concepts with more than 3 scenes", () => {
    const concept = {
      title: "Too Long",
      scenes: [
        { description: "Scene 1" },
        { description: "Scene 2" },
        { description: "Scene 3" },
        { description: "Scene 4" },
      ],
    };
    assert.ok(!ModelConceptSchema.safeParse(concept).success, "4-scene concept should be rejected");
  });

  it("rejects concept with missing title", () => {
    const concept = {
      scenes: [{ description: "s1" }, { description: "s2" }, { description: "s3" }],
    };
    assert.ok(!ModelConceptSchema.safeParse(concept).success, "Missing title should be rejected");
  });
});

describe("UGC generate — video response contract", () => {
  const VideoResponseSchema = z.object({
    images: z.array(z.any()).length(0),
    videoUrl: z.string().url(),
  });

  it("valid video response passes schema", () => {
    const response = {
      images: [],
      videoUrl: "https://storage.googleapis.com/bucket/ugc-videos/test.mp4?X-Goog-Signature=xyz",
    };
    assert.ok(VideoResponseSchema.safeParse(response).success, "Valid video response should pass");
  });

  it("video response without videoUrl fails schema", () => {
    assert.ok(!VideoResponseSchema.safeParse({ images: [] }).success, "Missing videoUrl should fail");
  });

  it("video response with relative URL fails schema", () => {
    const response = { images: [], videoUrl: "/videos/test.mp4" };
    assert.ok(!VideoResponseSchema.safeParse(response).success, "Relative videoUrl should fail");
  });
});
