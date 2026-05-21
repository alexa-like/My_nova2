import axios from "axios";
import { logger } from "../../lib/logger.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";

export async function generateVideo(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const config = await getOrCreateBotConfig();
  const modelId = config.activeVideoModel;
  const endpoint = `https://api-inference.huggingface.co/models/${modelId}`;

  try {
    logger.info({ model: modelId, prompt }, "Generating video");
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

    if (contentType.includes("video") || byteLength > 10000) {
      logger.info({ model: modelId, byteLength }, "Video generated successfully");
      return Buffer.from(response.data);
    }

    logger.warn({ contentType, byteLength }, "Video response was not usable");
    return null;
  } catch (err: any) {
    logger.warn(
      { err: err?.message, status: err?.response?.status },
      "Video generation failed"
    );
    return null;
  }
}
