import axios from "axios";
import { logger } from "../../lib/logger.js";
import type { TtsProvider } from "../models/BotConfig.js";

const HF_TTS_ENDPOINT = "https://router.huggingface.co/hf-inference/models/microsoft/speecht5_tts";
const OPENROUTER_TTS_ENDPOINT = "https://openrouter.ai/api/v1/audio/speech";

export type TtsFormat = "mp3" | "wav";
export interface TtsResult {
  buffer: Buffer;
  format: TtsFormat;
}

// ── StreamElements TTS — free, no API key, returns MP3 ───────────────────────
const SE_VOICES = ["Brian", "Amy", "Emma", "Joanna", "Kimberly", "Salli", "Joey", "Justin", "Matthew"];

async function ttsStreamElements(text: string, voice = "Brian"): Promise<TtsResult | null> {
  const safeVoice = SE_VOICES.includes(voice) ? voice : "Brian";
  try {
    const encoded = encodeURIComponent(text.slice(0, 500));
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${safeVoice}&text=${encoded}`;
    logger.info({ chars: text.length, voice: safeVoice }, "Generating TTS via StreamElements");
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: { "User-Agent": "Nova-Bot/1.0" },
    });
    const buf = Buffer.from(response.data);
    if (buf.byteLength > 500) {
      logger.info({ bytes: buf.byteLength }, "StreamElements TTS success");
      return { buffer: buf, format: "mp3" };
    }
    logger.warn({ bytes: buf.byteLength }, "StreamElements returned too-small response");
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "StreamElements TTS failed");
    return null;
  }
}

// ── OpenRouter TTS — paid, returns MP3 ────────────────────────────────────────
async function ttsOpenRouter(text: string, voice = "alloy"): Promise<TtsResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    logger.info({ chars: text.length, voice }, "Generating TTS via OpenRouter");
    const response = await axios.post(
      OPENROUTER_TTS_ENDPOINT,
      { model: "openai/gpt-4o-mini-tts", input: text.slice(0, 4096), voice, response_format: "mp3" },
      {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );
    const buf = Buffer.from(response.data);
    if (buf.byteLength > 500) {
      logger.info({ bytes: buf.byteLength }, "OpenRouter TTS success");
      return { buffer: buf, format: "mp3" };
    }
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "OpenRouter TTS failed");
    return null;
  }
}

// ── HuggingFace SpeechT5 — free (if token set), returns WAV ──────────────────
async function ttsHuggingFace(text: string): Promise<TtsResult | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      logger.info({ chars: text.length, attempt }, "Generating TTS via HuggingFace SpeechT5");
      const response = await axios.post(
        HF_TTS_ENDPOINT,
        { inputs: text.slice(0, 600) },
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Wait-For-Model": "true" },
          responseType: "arraybuffer",
          timeout: 60000,
        }
      );
      const buf = Buffer.from(response.data);
      if (buf.byteLength > 500) {
        logger.info({ bytes: buf.byteLength }, "HuggingFace TTS success");
        return { buffer: buf, format: "wav" };
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503 && attempt === 1) {
        logger.warn("HuggingFace TTS model loading — retrying");
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      logger.warn({ err: err?.message, status }, "HuggingFace TTS failed");
      return null;
    }
  }
  return null;
}

// ── Public function — tries providers in order ────────────────────────────────
// Order: StreamElements (free, fast) → OpenRouter (paid) → HuggingFace (slow)
export async function generateTTS(
  text: string,
  provider: TtsProvider = "huggingface",
  voice = "alloy"
): Promise<TtsResult | null> {
  // Always try StreamElements first — it's free, fast, and reliable
  const seResult = await ttsStreamElements(text, voice);
  if (seResult) return seResult;

  // OpenRouter next (if provider is openrouter or as fallback)
  if (provider === "openrouter" || process.env.OPENROUTER_API_KEY) {
    const orResult = await ttsOpenRouter(text, voice);
    if (orResult) return orResult;
  }

  // HuggingFace last — slow but free
  const hfResult = await ttsHuggingFace(text);
  if (hfResult) return hfResult;

  return null;
}

export const TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
