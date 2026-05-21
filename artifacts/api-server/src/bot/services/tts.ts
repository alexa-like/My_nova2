import axios from "axios";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

export const VOICE_PREVIEW_TEXT = "Hey there! I'm Nova, your AI assistant. This is exactly how I sound!";

export const VOICE_DESCRIPTIONS: Record<string, string> = {
  "facebook/mms-tts-eng": "Nova — clean, natural, and clear",
  "espnet/kan-bayashi_ljspeech_vits": "Crystal — smooth and expressive female voice",
  "facebook/fastspeech2-en-ljspeech": "Echo — warm and steady",
  "suno/bark-small": "Bark — expressive and dynamic (slower)",
};

export async function textToSpeech(
  text: string,
  modelId?: string
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  let model = modelId;
  if (!model) {
    const config = await getOrCreateBotConfig();
    model = config.activeVoiceModel;
  }

  // Clamp text — TTS models work best under 400 chars
  const input = text.slice(0, 400).trim();
  if (!input) return null;

  logger.info({ model, length: input.length }, "Generating TTS audio");

  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      { inputs: input },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 90000,
      }
    );

    if (!response.data || response.data.byteLength < 100) {
      logger.warn({ model }, "TTS returned empty/tiny response");
      return null;
    }

    logger.info({ model, bytes: response.data.byteLength }, "TTS audio generated");
    return Buffer.from(response.data);
  } catch (err: any) {
    // Model loading (503) — cold start
    if (err?.response?.status === 503) {
      logger.warn({ model }, "TTS model warming up (503)");
    } else {
      logger.warn({ err: err?.message, status: err?.response?.status }, "TTS generation failed");
    }
    return null;
  }
}
