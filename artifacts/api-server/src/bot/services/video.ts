import axios from "axios";
import { logger } from "../../lib/logger.js";

// Models ordered by reliability — zeroscope tends to be more available
const VIDEO_MODELS = [
  "cerspense/zeroscope_v2_576w",
  "damo-vilab/text-to-video-ms-1.7b",
];

const RETRY_DELAY_MS = 15000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateVideo(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  for (const modelId of VIDEO_MODELS) {
    const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info({ model: modelId, prompt, attempt }, "Generating video");

        const response = await axios.post(
          endpoint,
          { inputs: prompt },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
            timeout: 240000,
          }
        );

        const contentType = (response.headers["content-type"] as string) || "";
        const byteLength = (response.data as Buffer)?.byteLength ?? 0;

        if (
          contentType.includes("video") ||
          contentType.includes("gif") ||
          contentType.includes("octet-stream") ||
          byteLength > 50000
        ) {
          logger.info({ model: modelId, byteLength, contentType }, "Video generated successfully");
          return Buffer.from(response.data);
        }

        // Decode error response if any
        try {
          const text = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
          const json = JSON.parse(text);
          logger.warn({ model: modelId, error: json?.error }, "Video API returned non-video");
        } catch {}

        break; // try next model
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503 && attempt === 1) {
          logger.warn({ model: modelId, attempt }, "Video model warming up — waiting before retry");
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        logger.warn({ err: err?.message, status, model: modelId }, "Video generation failed");
        break; // try next model
      }
    }
  }

  return null;
}
