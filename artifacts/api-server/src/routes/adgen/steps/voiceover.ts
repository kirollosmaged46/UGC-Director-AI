import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { AdScript, AdgenInputs } from "../types.js";
import { logger } from "../../../lib/logger.js";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

interface VoiceoverResult {
  audioPath: string | null;
  warning?: string;
}

async function tryGenerateVoiceover(
  text: string,
  isArabic: boolean,
  apiKey: string
): Promise<string> {
  const voiceId = isArabic ? "pNInz6obpgDQGcFmaJgB" : "21m00Tcm4TlvDq8ikWAM"; // Adam / Rachel
  const modelId = "eleven_multilingual_v2";

  const body = {
    text,
    model_id: modelId,
    voice_settings: isArabic
      ? { stability: 0.5, similarity_boost: 0.8, style: 0.2 }
      : { stability: 0.4, similarity_boost: 0.75, style: 0.3 },
  };

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`ElevenLabs API error ${res.status}: ${errText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const audioPath = join(tmpdir(), `adgen-audio-${randomUUID()}.mp3`);
  await writeFile(audioPath, buffer);
  return audioPath;
}

export async function generateVoiceover(
  script: AdScript,
  inputs: AdgenInputs
): Promise<VoiceoverResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    logger.warn("ELEVENLABS_API_KEY not set — skipping voiceover");
    return { audioPath: null, warning: "Voiceover unavailable: ElevenLabs API key not configured." };
  }

  const fullText = [
    script.hook,
    ...script.scenes.map((s) => s.voiceover),
    script.cta,
  ].join(" ");

  const isArabic = inputs.voiceoverLanguage === "arabic";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const audioPath = await tryGenerateVoiceover(fullText, isArabic, apiKey);
      logger.info({ audioPath }, "Voiceover generated");
      return { audioPath };
    } catch (err) {
      logger.error({ err, attempt }, "Voiceover generation attempt failed");
      if (attempt === 1) {
        return {
          audioPath: null,
          warning: "Voiceover generation failed — video will be produced without audio.",
        };
      }
    }
  }

  return { audioPath: null, warning: "Voiceover generation failed after retries." };
}
