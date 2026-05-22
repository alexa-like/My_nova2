import axios from "axios";
import { logger } from "../../lib/logger.js";

const WHISPER_ENDPOINT =
  "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3";

/**
 * Transcribe audio using HuggingFace Whisper Large v3.
 * Pass raw audio bytes (OGG, MP3, WAV, FLAC — Whisper handles all common formats).
 * Returns the transcribed text, or null if unavailable.
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    logger.warn("HUGGINGFACE_API_TOKEN not set — STT unavailable");
    return null;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      logger.info({ bytes: audioBuffer.byteLength, attempt }, "Transcribing audio via Whisper");

      const response = await axios.post(
        WHISPER_ENDPOINT,
        audioBuffer,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "audio/ogg",
            "X-Wait-For-Model": "true",
          },
          timeout: 60000,
        }
      );

      const text =
        response.data?.text ||
        response.data?.[0]?.text ||
        (typeof response.data === "string" ? response.data : null);

      if (text && typeof text === "string" && text.trim().length > 0) {
        logger.info({ chars: text.length }, "Whisper transcription success");
        return text.trim();
      }

      logger.warn({ data: JSON.stringify(response.data).slice(0, 200) }, "Whisper returned empty text");
      return null;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503 && attempt === 1) {
        logger.warn("Whisper model loading (503) — waiting before retry");
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      logger.warn({ err: err?.message, status }, "Whisper STT failed");
      return null;
    }
  }

  return null;
}
