import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { AdgenInputs, AdScript } from "../types.js";
import { logger } from "../../../lib/logger.js";
import { AVATAR_PRESETS } from "../avatars.js";

type DurationConfig = {
  sceneCount: number;
  sceneDuration: number;
  hookDuration: number;
  ctaDuration: number;
};

function getDurationConfig(duration?: string): DurationConfig {
  switch (duration) {
    case "15s":
      return { sceneCount: 2, sceneDuration: 4, hookDuration: 3, ctaDuration: 4 };
    case "60s":
      return { sceneCount: 8, sceneDuration: 6, hookDuration: 4, ctaDuration: 5 };
    case "30s":
    default:
      return { sceneCount: 4, sceneDuration: 5, hookDuration: 3, ctaDuration: 4 };
  }
}

function buildSceneTemplate(count: number, duration: number): string {
  return Array.from({ length: count }, (_, i) => JSON.stringify({
    scene_number: i + 1,
    duration_seconds: duration,
    visual: "exact camera description — location, framing, action, lighting",
    voiceover: "what the creator says — casual, first person, imperfect",
    emotion: "what the viewer feels",
  }, null, 2)).join(",\n    ");
}

function buildSystemPrompt(inputs: AdgenInputs): string {
  const cfg = getDurationConfig(inputs.videoDuration);
  const avatar = inputs.selectedAvatarId
    ? AVATAR_PRESETS.find((a) => a.id === inputs.selectedAvatarId)
    : null;

  const avatarContext = avatar
    ? `\nCREATOR PERSONA: ${avatar.name} — ${avatar.description}. Style: ${avatar.style}.`
    : "";

  return `You are a world-class UGC creative director. You write video ad scripts that feel completely real — not corporate, not polished, not AI. Think Arcads, Billo, real TikTok creators who actually use the product.

Return ONLY a valid JSON object. No explanation. No markdown. No preamble. Just raw JSON.

TARGET LENGTH: ${inputs.videoDuration ?? "30s"} — write exactly ${cfg.sceneCount} scenes (each ~${cfg.sceneDuration}s), hook ~${cfg.hookDuration}s, CTA ~${cfg.ctaDuration}s.
${avatarContext}

Structure:
{
  "hook": "first ${cfg.hookDuration} seconds — one punchy line or mid-action moment. No brand name. No greeting. Starts mid-thought or mid-action.",
  "hook_variants": ["variant 1", "variant 2", "variant 3"],
  "scenes": [
    ${buildSceneTemplate(cfg.sceneCount, cfg.sceneDuration)}
  ],
  "cta": "last ${cfg.ctaDuration} seconds — casual first-person. Never say click the link or buy now.",
  "caption": "platform-native caption with emojis under 150 chars"
}

AD ANGLE RULES:
us-vs-them: Open with pain of old way. Show the switch naturally. End with result not features. Never name a competitor.
before-after: Before is emotionally real not just visual. After shows feeling not appearance. Transition feels accidental and organic.
social-proof: Start with genuine surprise or discovery. One hyper-specific personal detail. Never list features. Feels like telling a friend.

HOOK STYLE RULES:
- question: opens with a relatable question the viewer is already thinking
- bold-statement: controversial or surprising opener that stops the scroll
- mid-action: starts in the middle of using the product — no intro
- shocking-fact: one stat or fact that reframes everything
- i-tried-this: self-aware, curious, testing energy

AUTHENTICITY NON-NEGOTIABLES:
- Visuals are always real locations: bedroom, bathroom, kitchen, gym bag, car seat, cafe
- Clothing is casual: hoodie, oversized tee — not influencer outfit
- Lighting is imperfect: window light, lamp, outdoor shade — never studio flash
- Voiceover has natural pauses and filler — "honestly", "like", "I was not expecting this"
- If Arabic: Gulf dialect, casual, conversational — never formal or MSA`;
}

function buildUserMessage(inputs: AdgenInputs): string {
  const avatar = inputs.selectedAvatarId
    ? AVATAR_PRESETS.find((a) => a.id === inputs.selectedAvatarId)
    : null;

  return `Product: ${inputs.productName}
Category: ${inputs.productCategory}
Description: ${inputs.productDescription}
Ad Angle: ${inputs.adAngle}
Platform: ${inputs.platform}
Target Duration: ${inputs.videoDuration ?? "30s"}
Hook Style: ${inputs.hookStyle ?? "none specified"}
Language: ${inputs.voiceoverLanguage ?? "english"}
Creator Persona: ${avatar ? `${avatar.name} — ${avatar.description}` : "unspecified"}
Reference video provided: ${inputs.referenceVideoBase64 ? "yes" : "no"}
Creative Vision: ${inputs.creativeVision ?? "none"}

Write the full UGC video script.`;
}

async function tryParseScript(text: string): Promise<AdScript> {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as AdScript;
}

export async function generateScript(inputs: AdgenInputs): Promise<AdScript> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const userContent = attempt === 0
        ? buildUserMessage(inputs)
        : "The previous response was not valid JSON. Return ONLY the raw JSON object, no markdown, no explanation. Fix the JSON and return it now.";

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: buildSystemPrompt(inputs),
        messages: [
          { role: "user", content: attempt === 0 ? userContent : buildUserMessage(inputs) },
          ...(attempt === 1
            ? [
                { role: "assistant" as const, content: "I'll fix the JSON:" },
                { role: "user" as const, content: userContent },
              ]
            : []),
        ],
      });

      const block = message.content[0];
      if (block.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      return await tryParseScript(block.text);
    } catch (err) {
      logger.error({ err, attempt }, "Script generation attempt failed");
      lastError = err;
    }
  }

  throw new Error(`Script generation failed after 2 attempts: ${String(lastError)}`);
}
