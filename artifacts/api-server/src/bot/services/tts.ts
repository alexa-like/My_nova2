import axios from "axios";
import { spawn } from "child_process";
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

// ── Convert any audio buffer to OGG OPUS using ffmpeg ─────────────────────────
// HuggingFace TTS models return WAV/FLAC. Telegram sendVoice requires OGG OPUS.
// ffmpeg is available in the Replit/Nix runtime.
async function convertToOggOpus(inputBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-loglevel", "error",
      "-i", "pipe:0",        // read from stdin
      "-c:a", "libopus",     // encode as Opus
      "-b:a", "24k",         // low bitrate — voice is fine at 24k
      "-vbr", "on",
      "-application", "voip",
      "-f", "ogg",           // OGG container
      "pipe:1",              // write to stdout
    ]);

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    ff.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ff.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    ff.on("close", (code) => {
      if (code !== 0) {
        const errText = Buffer.concat(errChunks).toString("utf-8");
        logger.warn({ code, err: errText.slice(0, 200) }, "ffmpeg OGG conversion failed");
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      const result = Buffer.concat(chunks);
      if (result.byteLength < 100) {
        reject(new Error("ffmpeg produced empty output"));
        return;
      }
      resolve(result);
    });

    ff.on("error", reject);
    ff.stdin.write(inputBuffer);
    ff.stdin.end();
  });
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

        const rawBuf = Buffer.from(response.data);
        if (!rawBuf || rawBuf.byteLength < 50) {
          logger.warn({ model, bytes: rawBuf?.byteLength }, "TTS returned empty/tiny response");
          break;
        }

        logger.info({ model, bytes: rawBuf.byteLength }, "TTS audio generated — converting to OGG OPUS");

        // Convert WAV/FLAC → OGG OPUS so Telegram sendVoice accepts it
        try {
          const ogg = await convertToOggOpus(rawBuf);
          logger.info({ model, oggBytes: ogg.byteLength }, "OGG OPUS conversion successful");
          return ogg;
        } catch (convErr: any) {
          logger.warn({ convErr: convErr?.message }, "OGG conversion failed — returning raw audio");
          return rawBuf; // return raw anyway, sendAudio fallback handles it
        }
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
