import axios from "axios";
import { logger } from "../../lib/logger.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";

// ASR fallback chain: turbo (fastest high-quality) → distil-large (efficient) → base (most reliable)
const ASR_FALLBACK_CHAIN = [
  "openai/whisper-large-v3-turbo",   // 7.5M DL, inf:true, faster than v3
  "distil-whisper/distil-large-v3",  // 1.4M DL, inf:true, distilled
  "openai/whisper-medium",           // inf:true, balanced
  "openai/whisper-base",             // inf:true, most reliable/fastest
];

export async function transcribeVoice(
  audioBuffer: Buffer,
  modelId?: string
): Promise<string | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  let primaryModel = modelId;
  if (!primaryModel) {
    const config = await getOrCreateBotConfig();
    primaryModel = config.activeAsrModel || "openai/whisper-large-v3-turbo";
  }

  // Build deduplicated endpoint list: primary first, then the full fallback chain
  const modelsToTry = [
    primaryModel,
    ...ASR_FALLBACK_CHAIN.filter(m => m !== primaryModel),
  ];

  for (const model of modelsToTry) {
    const endpoint = `https://api-inference.huggingface.co/models/${model}`;
    try {
      logger.info({ model, endpoint }, "Transcribing voice");
      const response = await axios.post(endpoint, audioBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "audio/ogg",
          Accept: "application/json",
          "X-Wait-For-Model": "true",  // wait for cold-start instead of immediate 503
        },
        timeout: 90000,
      });

      const text = response.data?.text?.trim();
      if (text && text.length > 0) {
        logger.info({ length: text.length, model }, "Voice transcribed successfully");
        return text;
      }

      logger.warn({ data: response.data, model }, "ASR returned empty transcription, trying next");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503) {
        logger.warn({ model }, "ASR model warming up (503), trying next fallback");
      } else {
        logger.warn({ err: err?.message, status, model }, "Voice transcription failed, trying next");
      }
    }
  }

  return null;
}

export async function downloadTelegramAudio(
  bot: import("node-telegram-bot-api"),
  fileId: string
): Promise<Buffer | null> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const file = await bot.getFile(fileId);
    if (!file.file_path) return null;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    return Buffer.from(response.data);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to download Telegram audio");
    return null;
  }
}
