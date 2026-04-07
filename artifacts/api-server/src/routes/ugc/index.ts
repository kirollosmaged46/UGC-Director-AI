import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { editImages, generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { mkdirSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import os from "os";

const router = Router();

function buildUgcPrompt(params: {
  angle: string;
  lighting: string;
  aspectRatio: string;
  contentType: string;
  platform: string;
  creativeVision?: string;
}): string {
  const { angle, lighting, aspectRatio, contentType, platform, creativeVision } = params;

  const angleMap: Record<string, string> = {
    overhead: "overhead flat-lay shot looking straight down at the product",
    "eye-level": "eye-level shot, natural perspective as if held by a real person",
    "low-angle": "low-angle hero shot looking up at the product",
    "dutch-tilt": "slightly tilted Dutch tilt angle for dynamic visual energy",
    "close-up": "extreme close-up macro detail shot revealing product texture",
    wide: "wide environmental lifestyle shot with product as focal point",
  };

  const lightingMap: Record<string, string> = {
    "golden-hour": "warm golden hour sunlight, long soft shadows, natural outdoor warmth",
    "studio-white": "clean bright studio white lighting, crisp professional feel",
    "moody-dark": "moody low-key dramatic lighting, deep shadows, cinematic atmosphere",
    "outdoor-natural": "bright natural daylight, soft diffused outdoor ambience",
    neon: "vibrant neon accent lighting with colorful reflections, nightlife urban aesthetic",
  };

  const angleDesc = angleMap[angle] || angle;
  const lightingDesc = lightingMap[lighting] || lighting;

  const platformContext =
    platform === "tiktok"
      ? "TikTok-native raw aesthetic, authentic Gen Z energy"
      : platform === "instagram"
      ? "Instagram-worthy, polished yet authentic lifestyle feel"
      : "YouTube Shorts ready, dynamic thumbnail-quality composition";

  let prompt = `Authentic UGC-style product photo. ${angleDesc}. ${lightingDesc}. ${platformContext}. `;
  prompt +=
    "The product should be prominently featured but in a genuine casual setting that feels completely real and unscripted. ";
  prompt +=
    "NOT stock photography. Feels like a real person shot this on their smartphone in a relatable real-world environment. ";
  prompt +=
    "High quality phone camera aesthetic with slight natural imperfections. No text overlays. No watermarks. ";

  if (creativeVision) {
    prompt += `Creative director vision: ${creativeVision}. `;
  }

  if (contentType === "video_concept") {
    prompt +=
      "This is a video keyframe — composition implies motion and dynamic storytelling.";
  }

  return prompt;
}

router.post("/generate", async (req, res) => {
  const tmpFiles: string[] = [];

  try {
    const {
      imageBase64,
      angle,
      lighting,
      aspectRatio,
      count,
      contentType,
      platform = "instagram",
      creativeVision,
    } = req.body as {
      imageBase64: string;
      angle: string;
      lighting: string;
      aspectRatio: string;
      count: number;
      contentType: string;
      platform?: string;
      creativeVision?: string;
    };

    if (contentType === "video_concept") {
      const videoConcepts = [];
      for (let i = 0; i < Math.min(count, 3); i++) {
        const conceptResponse = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 600,
          messages: [
            {
              role: "user",
              content: `You are an expert UGC video director. Create a specific video concept storyboard for a product shoot:

Camera angle: ${angle}
Lighting mood: ${lighting}
Platform: ${platform}
Creative vision: ${creativeVision || "authentic and genuine, feels like real UGC"}

Provide a 3-scene UGC video concept (each ~3-5 seconds).

Format as valid JSON only: { "title": "short catchy video title max 8 words", "storyboard": "Scene 1: description\\n\\nScene 2: description\\n\\nScene 3: description" }`,
            },
          ],
        });

        const raw = conceptResponse.choices[0]?.message?.content ?? "{}";
        try {
          const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
          const parsed = JSON.parse(cleaned) as { title?: string; storyboard?: string };
          videoConcepts.push({ ...parsed, index: i });
        } catch {
          videoConcepts.push({
            title: `UGC Video Concept ${i + 1}`,
            storyboard: raw,
            index: i,
          });
        }
      }
      res.json({ images: [], videoConcepts });
      return;
    }

    const prompt = buildUgcPrompt({
      angle,
      lighting,
      aspectRatio,
      contentType,
      platform,
      creativeVision,
    });

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `ugc-product-${Date.now()}.png`);
    writeFileSync(tmpPath, imageBuffer);
    tmpFiles.push(tmpPath);

    const generatedImages = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      const editedBuffer = await editImages([tmpPath], prompt);
      generatedImages.push({
        b64_json: editedBuffer.toString("base64"),
        index: i,
      });
    }

    res.json({ images: generatedImages, videoConcepts: [] });
  } catch (err) {
    req.log.error({ err }, "Failed to generate UGC content");
    res.status(500).json({ error: "Failed to generate UGC content" });
  } finally {
    for (const f of tmpFiles) {
      try {
        unlinkSync(f);
      } catch {
        // ignore cleanup errors
      }
    }
  }
});

router.post("/hooks", async (req, res) => {
  try {
    const {
      productDescription,
      platform,
      tone = "authentic",
      imageContext,
    } = req.body as {
      productDescription: string;
      platform: string;
      tone?: string;
      imageContext?: string;
    };

    const platformGuide =
      platform === "tiktok"
        ? "TikTok (punchy hooks, Gen Z voice, 'POV:', 'Tell me why...', 'You need this if...' formats work well)"
        : platform === "instagram"
        ? "Instagram Reels (lifestyle-focused, mix of curiosity + aspiration, slightly more polished than TikTok)"
        : "YouTube Shorts (value-driven, problem-solution framing, optimized for watch time)";

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are an elite UGC content strategist. Generate 5 scroll-stopping hooks/captions for ${platformGuide}.

Product: ${productDescription}
Tone: ${tone}
${imageContext ? `Visual context: ${imageContext}` : ""}

Rules:
- Each hook must feel authentic, like a real person talking — not a brand
- No corporate speak, no generic phrases, no buzzwords
- Mix formats: relatable pain points, surprising reveals, social proof angles, transformation hooks
- Each hook must be under 150 characters
- No emojis

Return ONLY valid JSON: { "hooks": [{ "text": "hook text here", "platform": "${platform}" }, ...] } with exactly 5 hooks.`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{"hooks":[]}';
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned) as { hooks?: Array<{ text: string; platform: string }> };
      res.json(parsed);
    } catch {
      res.json({ hooks: [{ text: raw, platform }] });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to generate hooks");
    res.status(500).json({ error: "Failed to generate hooks" });
  }
});

export default router;
