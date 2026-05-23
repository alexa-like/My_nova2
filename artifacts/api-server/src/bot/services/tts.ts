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

// Split text at sentence boundaries so each chunk fits safely in a URL
function splitIntoChunks(text: string, maxLen = 240): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    const sub = remaining.slice(0, maxLen);
    // Prefer splitting at sentence end
    const lastSentence = Math.max(
      sub.lastIndexOf(". "),
      sub.lastIndexOf("! "),
      sub.lastIndexOf("? "),
      sub.lastIndexOf("\n")
    );
    let splitAt = lastSentence > 40 ? lastSentence + 1 : sub.lastIndexOf(" ");
    if (splitAt < 40) splitAt = maxLen; // no good boundary — hard cut
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return chunks.filter((c) => c.length > 0);
}

async function ttsStreamElementsChunk(chunk: string, voice: string): Promise<Buffer | null> {
  try {
    const encoded = encodeURIComponent(chunk);
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encoded}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers: { "User-Agent": "Nova-Bot/1.0" },
    });
    const buf = Buffer.from(response.data);
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

async function ttsStreamElements(text: string, voice = "Brian"): Promise<TtsResult | null> {
  const safeVoice = SE_VOICES.includes(voice) ? voice : "Brian";
  // Cap total text at 3000 chars to keep response time reasonable
  const safeText = text.slice(0, 3000);
  const chunks = splitIntoChunks(safeText);
  logger.info({ chars: safeText.length, chunks: chunks.length, voice: safeVoice }, "Generating TTS via StreamElements");

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const buf = await ttsStreamElementsChunk(chunk, safeVoice);
    if (!buf) {
      logger.warn({ chunk: chunk.slice(0, 40) }, "StreamElements chunk failed");
      // If the very first chunk fails the whole provider is down — bail out
      if (buffers.length === 0) return null;
      // Otherwise skip bad chunk and keep going
      continue;
    }
    buffers.push(buf);
  }

  if (buffers.length === 0) return null;

  // MP3 frames are self-contained — simple buffer concat produces a valid MP3
  const combined = Buffer.concat(buffers);
  logger.info({ bytes: combined.byteLength, chunks: buffers.length }, "StreamElements TTS success");
  return { buffer: combined, format: "mp3" };
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
