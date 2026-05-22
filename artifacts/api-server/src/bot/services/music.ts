import axios from "axios";
import { logger } from "../../lib/logger.js";

// Models ordered by reliability
const MUSIC_MODELS = [
  "facebook/musicgen-small",
  "facebook/musicgen-stereo-small",
];

const MAX_RETRIES = 4;
const COLD_START_DELAY_MS = 18000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function generateMusic(
  prompt: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  for (const modelId of MUSIC_MODELS) {
    const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info({ model: modelId, prompt, attempt }, "Generating music");

        const response = await axios.post(
          endpoint,
          { inputs: prompt },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Wait-For-Model": "true",
            },
            responseType: "arraybuffer",
            timeout: 200000,
          }
        );

        const contentType = (response.headers["content-type"] as string) || "";
        const byteLength = (response.data as Buffer)?.byteLength ?? 0;

        if (
          contentType.includes("audio") ||
          contentType.includes("octet-stream") ||
          byteLength > 2000
        ) {
          logger.info({ model: modelId, attempt, byteLength }, "Music generated successfully");
          return Buffer.from(response.data);
        }

        // Decode error JSON
        try {
          const text = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
          const json = JSON.parse(text);
          const errMsg: string = json?.error || "";
          logger.warn({ model: modelId, error: errMsg }, "Music API returned non-audio");
          // Model still loading — wait and retry
          if (errMsg.toLowerCase().includes("loading") && attempt < MAX_RETRIES) {
            const waitMs = COLD_START_DELAY_MS * attempt;
            if (onStatus) await onStatus(`⏳ Model loading... waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_RETRIES})`);
            await sleep(waitMs);
            continue;
          }
        } catch {}

        break; // Bad non-loading response — try next model
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt < MAX_RETRIES) {
          const waitMs = COLD_START_DELAY_MS * attempt;
          if (onStatus) await onStatus(`⏳ Music model warming up... ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_RETRIES})`);
          logger.warn({ model: modelId, attempt, waitMs, status }, "Music model cold start — waiting");
          await sleep(waitMs);
          continue;
        }
        logger.warn({ err: err?.message, status, model: modelId, attempt }, "Music generation failed");
        break;
      }
    }
    if (onStatus) await onStatus(`🔄 Trying next model...`);
  }

  return null;
}
