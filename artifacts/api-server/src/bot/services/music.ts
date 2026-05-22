import axios from "axios";
import { logger } from "../../lib/logger.js";

// Models ordered by reliability — tries each in sequence
const MUSIC_MODELS = [
  "facebook/musicgen-small",
  "facebook/musicgen-stereo-small",
];

const MAX_RETRIES = 3;
const COLD_START_DELAY_MS = 20000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function generateMusic(prompt: string): Promise<Buffer | null> {
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
            },
            responseType: "arraybuffer",
            timeout: 180000,
          }
        );

        const contentType = (response.headers["content-type"] as string) || "";
        const byteLength = (response.data as Buffer)?.byteLength ?? 0;

        if (
          contentType.includes("audio") ||
          contentType.includes("octet-stream") ||
          byteLength > 5000
        ) {
          logger.info({ model: modelId, attempt, byteLength }, "Music generated successfully");
          return Buffer.from(response.data);
        }

        // Decode any error JSON response
        try {
          const text = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
          const json = JSON.parse(text);
          logger.warn({ model: modelId, error: json?.error }, "Music API returned non-audio");
        } catch {}

        break; // Bad response — try next model
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt < MAX_RETRIES) {
          const delay = COLD_START_DELAY_MS * attempt;
          logger.warn({ model: modelId, attempt, delay, status }, "Music model cold start — waiting");
          await sleep(delay);
          continue;
        }
        logger.warn({ err: err?.message, status, model: modelId, attempt }, "Music generation failed");
        // Non-503 errors — try next model
        break;
      }
    }
  }

  return null;
}
