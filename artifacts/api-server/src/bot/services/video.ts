import axios from "axios";
import { logger } from "../../lib/logger.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";

const FALLBACK_VIDEO_MODEL = "cerspense/zeroscope_v2_576w";
const RETRY_DELAY_MS = 12000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateVideo(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const config = await getOrCreateBotConfig();
  const primaryModel = config.activeVideoModel;

  const modelsToTry = [primaryModel];
  if (primaryModel !== FALLBACK_VIDEO_MODEL) modelsToTry.push(FALLBACK_VIDEO_MODEL);

  for (const modelId of modelsToTry) {
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
            timeout: 200000,
          }
        );

        const contentType = (response.headers["content-type"] as string) || "";
        const byteLength = (response.data as Buffer)?.byteLength ?? 0;

        if (contentType.includes("video") || contentType.includes("gif") || byteLength > 10000) {
          logger.info({ model: modelId, byteLength }, "Video generated successfully");
          return Buffer.from(response.data);
        }

        logger.warn({ contentType, byteLength, model: modelId }, "Video response not usable");
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
