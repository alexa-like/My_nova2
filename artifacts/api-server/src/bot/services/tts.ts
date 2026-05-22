import axios from "axios";
import { logger } from "../../lib/logger.js";
import type { TtsProvider } from "../models/BotConfig.js";

const HF_TTS_ENDPOINT = "https://router.huggingface.co/hf-inference/models/microsoft/speecht5_tts";

const OPENROUTER_TTS_ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";

// ── Hugging Face SpeechT5 ─────────────────────────────────────────────────────
async function ttsHuggingFace(text: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    logger.warn("HUGGINGFACE_API_TOKEN not set — TTS unavailable");
    return null;
  }

  try {
    logger.info({ chars: text.length }, "Generating TTS via HuggingFace SpeechT5");
    const response = await axios.post(
      HF_TTS_ENDPOINT,
      { text_inputs: text.slice(0, 600) },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Wait-For-Model": "true",
        },
        responseType: "arraybuffer",
        timeout: 60000,
      }
    );

    const buf = Buffer.from(response.data);
    if (buf.byteLength > 500) {
      logger.info({ bytes: buf.byteLength }, "HuggingFace TTS success");
      return buf;
    }
    logger.warn({ bytes: buf.byteLength }, "HuggingFace TTS returned too-small response");
    return null;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 503) {
      logger.warn("HuggingFace TTS model loading — retrying after delay");
      await new Promise(r => setTimeout(r, 8000));
      try {
        const retry = await axios.post(
          HF_TTS_ENDPOINT,
          { text_inputs: text.slice(0, 600) },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Wait-For-Model": "true",
            },
            responseType: "arraybuffer",
            timeout: 60000,
          }
        );
        const buf = Buffer.from(retry.data);
        if (buf.byteLength > 500) return buf;
      } catch {}
    }
    logger.warn({ err: err?.message, status }, "HuggingFace TTS failed");
    return null;
  }
}

// ── OpenRouter TTS ────────────────────────────────────────────────────────────
async function ttsOpenRouter(text: string, voice = "alloy"): Promise<Buffer | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("OPENROUTER_API_KEY not set — OpenRouter TTS unavailable");
    return null;
  }

  try {
    logger.info({ chars: text.length, voice }, "Generating TTS via OpenRouter");
    const response = await axios.post(
      OPENROUTER_TTS_ENDPOINT,
      {
        model: "openai/gpt-4o-mini-tts",
        input: text.slice(0, 4096),
        voice,
        response_format: "mp3",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );

    const buf = Buffer.from(response.data);
    if (buf.byteLength > 500) {
      logger.info({ bytes: buf.byteLength }, "OpenRouter TTS success");
      return buf;
    }
    logger.warn({ bytes: buf.byteLength }, "OpenRouter TTS returned too-small response");
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message, status: err?.response?.status }, "OpenRouter TTS failed");
    return null;
  }
}

// ── Public function ───────────────────────────────────────────────────────────

export async function generateTTS(
  text: string,
  provider: TtsProvider = "huggingface",
  voice = "alloy"
): Promise<Buffer | null> {
  if (provider === "openrouter") {
    const buf = await ttsOpenRouter(text, voice);
    if (buf) return buf;
    logger.warn("OpenRouter TTS failed — falling back to HuggingFace");
    return ttsHuggingFace(text);
  }

  const buf = await ttsHuggingFace(text);
  if (buf) return buf;

  if (process.env.OPENROUTER_API_KEY) {
    logger.warn("HuggingFace TTS failed — falling back to OpenRouter");
    return ttsOpenRouter(text, voice);
  }

  return null;
}

export const TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
