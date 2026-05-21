import axios from "axios";
import { logger } from "../../lib/logger.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";

const WHISPER_FALLBACK = "openai/whisper-base";

export async function transcribeVoice(
  audioBuffer: Buffer,
  modelId?: string
): Promise<string | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  let model = modelId;
  if (!model) {
    const config = await getOrCreateBotConfig();
    model = config.activeAsrModel || "openai/whisper-large-v3";
  }

  const endpoints = [
    `https://api-inference.huggingface.co/models/${model}`,
    `https://api-inference.huggingface.co/models/${WHISPER_FALLBACK}`,
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate if same model

  for (const endpoint of endpoints) {
    try {
      logger.info({ endpoint }, "Transcribing voice");
      const response = await axios.post(endpoint, audioBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "audio/ogg",
          Accept: "application/json",
        },
        timeout: 90000,
      });

      const text = response.data?.text?.trim();
      if (text && text.length > 0) {
        logger.info({ length: text.length, endpoint }, "Voice transcribed successfully");
        return text;
      }

      logger.warn({ data: response.data, endpoint }, "Whisper returned empty transcription, trying next");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503) {
        logger.warn({ endpoint }, "ASR model warming up (503), trying fallback");
      } else {
        logger.warn({ err: err?.message, status, endpoint }, "Voice transcription failed, trying next");
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
