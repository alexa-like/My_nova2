import axios from "axios";
import { logger } from "../../lib/logger.js";

const MUSICGEN_ENDPOINT =
  "https://api-inference.huggingface.co/models/facebook/musicgen-small";

export async function generateMusic(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  try {
    logger.info({ prompt }, "Generating music");

    const response = await axios.post(
      MUSICGEN_ENDPOINT,
      { inputs: prompt, parameters: { duration: 10 } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "audio/wav",
        },
        responseType: "arraybuffer",
        timeout: 120000,
      }
    );

    const contentType = (response.headers["content-type"] as string) || "";
    if (
      contentType.includes("audio") ||
      (response.data as Buffer)?.byteLength > 1000
    ) {
      logger.info("Music generated successfully");
      return Buffer.from(response.data);
    }

    logger.warn({ contentType }, "Music response was not audio");
    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message, status: err?.response?.status }, "Music generation failed");
    return null;
  }
}
