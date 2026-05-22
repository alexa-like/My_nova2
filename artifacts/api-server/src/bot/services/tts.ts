import axios from "axios";
import { spawn } from "child_process";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

export const VOICE_PREVIEW_TEXT = "Hey there! I'm Nova, your AI assistant. This is exactly how I sound!";

// ── Edge TTS voices — free, no API key, Microsoft Azure quality ───────────────
// Voice IDs use "edge:" prefix to distinguish them from HuggingFace model IDs.
export const EDGE_TTS_VOICES: Record<string, string> = {
  "edge:en-US-AriaNeural":    "Aria — Warm & Natural (US)",
  "edge:en-US-GuyNeural":     "Guy — Clear & Confident (US)",
  "edge:en-US-JennyNeural":   "Jenny — Professional & Friendly (US)",
  "edge:en-GB-SoniaNeural":   "Sonia — Elegant British (UK)",
  "edge:en-AU-NatashaNeural": "Natasha — Australian Friendly",
};

// ── HuggingFace TTS descriptions (used as fallback) ───────────────────────────
export const VOICE_DESCRIPTIONS: Record<string, string> = {
  ...EDGE_TTS_VOICES,
  "hexgrad/Kokoro-82M":               "Kokoro — HF (requires HF token)",
  "facebook/mms-tts-eng":             "MMS — HF Fallback",
  "myshell-ai/MeloTTS-English":       "MeloTTS — HF Expressive",
  "suno/bark-small":                  "Bark — HF Dynamic (slow)",
  "espnet/kan-bayashi_ljspeech_vits": "VITS — HF Smooth",
};

const FALLBACK_HF_TTS = "facebook/mms-tts-eng";
const FALLBACK_EDGE_VOICE = "en-US-AriaNeural";
const RETRY_DELAY_MS = 8000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Convert any audio buffer to OGG OPUS via ffmpeg ───────────────────────────
// Telegram sendVoice requires OGG OPUS. Edge TTS outputs MP3, HF returns WAV/FLAC.
async function convertToOggOpus(inputBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-loglevel", "error",
      "-i", "pipe:0",
      "-c:a", "libopus",
      "-b:a", "24k",
      "-vbr", "on",
      "-application", "voip",
      "-f", "ogg",
      "pipe:1",
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

// ── Edge TTS — free Microsoft Azure quality, no API key needed ────────────────
async function generateEdgeTTS(text: string, voiceShortName: string): Promise<Buffer | null> {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceShortName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);

    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("end", () => {
        const mp3 = Buffer.concat(chunks);
        if (mp3.byteLength < 100) {
          reject(new Error("Edge TTS returned empty audio"));
          return;
        }
        resolve(mp3);
      });
      audioStream.on("error", (err) => reject(err));

      // Safety timeout — Edge TTS WebSocket should complete in well under 30s
      setTimeout(() => reject(new Error("Edge TTS timeout")), 30000);
    });
  } catch (err: any) {
    logger.warn({ err: err?.message, voice: voiceShortName }, "Edge TTS stream failed");
    return null;
  }
}

// ── Main TTS entry point ──────────────────────────────────────────────────────
export async function textToSpeech(
  text: string,
  modelId?: string
): Promise<Buffer | null> {
  let primaryModel = modelId;
  if (!primaryModel) {
    const config = await getOrCreateBotConfig();
    primaryModel = config.activeVoiceModel;
  }

  const input = text.slice(0, 400).trim();
  if (!input) return null;

  // ── Path 1: Edge TTS (model ID starts with "edge:") ─────────────────────────
  const isEdgeModel = primaryModel?.startsWith("edge:");
  const token = process.env.HUGGINGFACE_API_TOKEN;

  // If the configured model is an HF model but no token is set, fall through to edge-tts
  const useEdge = isEdgeModel || !token;

  if (useEdge) {
    const voiceName = isEdgeModel
      ? primaryModel!.replace("edge:", "")
      : FALLBACK_EDGE_VOICE;

    logger.info({ voice: voiceName, length: input.length }, "Generating TTS via Microsoft Edge");
    const mp3 = await generateEdgeTTS(input, voiceName);

    if (mp3) {
      try {
        const ogg = await convertToOggOpus(mp3);
        logger.info({ voice: voiceName, oggBytes: ogg.byteLength }, "Edge TTS → OGG OPUS success");
        return ogg;
      } catch (convErr: any) {
        logger.warn({ convErr: convErr?.message }, "OGG conversion failed — returning MP3");
        return mp3;
      }
    }

    // Edge failed — if we have a HF token, fall through to HF
    if (!token) return null;
    logger.warn({ voice: voiceName }, "Edge TTS failed, falling back to HuggingFace TTS");
  }

  // ── Path 2: HuggingFace TTS (fallback) ───────────────────────────────────────
  if (!token) return null;

  const hfModel = isEdgeModel ? FALLBACK_HF_TTS : (primaryModel ?? FALLBACK_HF_TTS);
  const modelsToTry = [hfModel];
  if (hfModel !== FALLBACK_HF_TTS) modelsToTry.push(FALLBACK_HF_TTS);

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info({ model, length: input.length, attempt }, "Generating TTS via HuggingFace");
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
          logger.warn({ model, bytes: rawBuf?.byteLength }, "HF TTS returned empty/tiny response");
          break;
        }

        logger.info({ model, bytes: rawBuf.byteLength }, "HF TTS audio received — converting to OGG OPUS");
        try {
          const ogg = await convertToOggOpus(rawBuf);
          logger.info({ model, oggBytes: ogg.byteLength }, "HF TTS OGG conversion success");
          return ogg;
        } catch (convErr: any) {
          logger.warn({ convErr: convErr?.message }, "OGG conversion failed — returning raw audio");
          return rawBuf;
        }
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt === 1) {
          logger.warn({ model }, "HF TTS model warming up — retrying after delay");
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        logger.warn({ err: err?.message, status, model }, "HF TTS failed, trying next");
        break;
      }
    }
  }

  return null;
}
