import axios from "axios";
import { logger } from "../../lib/logger.js";

// Models ordered by reliability
const VIDEO_MODELS = [
  "cerspense/zeroscope_v2_576w",
  "damo-vilab/text-to-video-ms-1.7b",
];

const COLD_START_DELAY_MS = 15000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateVideo(
  prompt: string,
  onStatus?: (msg: string) => Promise<void>
): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  for (const modelId of VIDEO_MODELS) {
    const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info({ model: modelId, prompt, attempt }, "Generating video");

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
            timeout: 250000,
          }
        );

        const contentType = (response.headers["content-type"] as string) || "";
        const byteLength = (response.data as Buffer)?.byteLength ?? 0;

        if (
          contentType.includes("video") ||
          contentType.includes("gif") ||
          contentType.includes("octet-stream") ||
          byteLength > 20000
        ) {
          logger.info({ model: modelId, byteLength, contentType }, "Video generated successfully");
          return Buffer.from(response.data);
        }

        // Decode error
        try {
          const text = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
          const json = JSON.parse(text);
          const errMsg: string = json?.error || "";
          logger.warn({ model: modelId, error: errMsg }, "Video API returned non-video");
          if (errMsg.toLowerCase().includes("loading") && attempt < 3) {
            const waitMs = COLD_START_DELAY_MS * attempt;
            if (onStatus) await onStatus(`⏳ Video model warming up... ${Math.round(waitMs / 1000)}s (attempt ${attempt}/3)`);
            await sleep(waitMs);
            continue;
          }
        } catch {}

        break;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt < 3) {
          const waitMs = COLD_START_DELAY_MS * attempt;
          if (onStatus) await onStatus(`⏳ Video model loading... ${Math.round(waitMs / 1000)}s (attempt ${attempt}/3)`);
          logger.warn({ model: modelId, attempt, status }, "Video model cold start — waiting");
          await sleep(waitMs);
          continue;
        }
        logger.warn({ err: err?.message, status, model: modelId }, "Video generation failed");
        break;
      }
    }
    if (onStatus) await onStatus(`🔄 Trying next video model...`);
  }

  return null;
}
