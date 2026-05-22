import axios from "axios";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

export const VOICE_PREVIEW_TEXT = "Hey there! I'm Nova, your AI assistant. This is exactly how I sound!";

// ── All voices verified on HF Inference API (May 2025) ───────────────────────
export const VOICE_DESCRIPTIONS: Record<string, string> = {
  "hexgrad/Kokoro-82M":               "Kokoro — best quality voice (10M users)",
  "facebook/mms-tts-eng":             "Nova — clean, natural, and clear",
  "myshell-ai/MeloTTS-English":       "Melo — expressive English TTS",
  "suno/bark-small":                  "Bark — dynamic and emotional (slower)",
  "espnet/kan-bayashi_ljspeech_vits": "Crystal — smooth and steady",
};

// Reliable fallback: mms-tts-eng is the most consistently available free TTS
const FALLBACK_TTS = "facebook/mms-tts-eng";
const RETRY_DELAY_MS = 8000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function textToSpeech(
  text: string,
  modelId?: string
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  let primaryModel = modelId;
  if (!primaryModel) {
    const config = await getOrCreateBotConfig();
    primaryModel = config.activeVoiceModel;
  }

  // Clamp text — TTS models work best under 400 chars
  const input = text.slice(0, 400).trim();
  if (!input) return null;

  const modelsToTry = [primaryModel];
  if (primaryModel !== FALLBACK_TTS) modelsToTry.push(FALLBACK_TTS);

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info({ model, length: input.length, attempt }, "Generating TTS audio");
        const response = await axios.post(
          `https://api-inference.huggingface.co/models/${model}`,
          { inputs: input },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Wait-For-Model": "true",
            },
            responseType: "arraybuffer",
            timeout: 90000,
          }
        );

        if (!response.data || response.data.byteLength < 50) {
          logger.warn({ model, bytes: response.data?.byteLength }, "TTS returned empty/tiny response");
          break;
        }

        logger.info({ model, bytes: response.data.byteLength }, "TTS audio generated");
        return Buffer.from(response.data);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt === 1) {
          logger.warn({ model }, "TTS model warming up — retrying after delay");
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        logger.warn({ err: err?.message, status, model }, "TTS failed, trying next");
        break;
      }
    }
  }

  return null;
}
