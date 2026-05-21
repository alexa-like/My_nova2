import axios from "axios";
import { logger } from "../../lib/logger.js";

const MUSICGEN_ENDPOINT =
  "https://api-inference.huggingface.co/models/facebook/musicgen-small";

const MAX_RETRIES = 3;
const COLD_START_DELAY_MS = 25000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function generateMusic(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info({ prompt, attempt }, "Generating music");

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
          timeout: 130000,
        }
      );

      const contentType = (response.headers["content-type"] as string) || "";
      if (
        contentType.includes("audio") ||
        (response.data as Buffer)?.byteLength > 1000
      ) {
        logger.info({ attempt }, "Music generated successfully");
        return Buffer.from(response.data);
      }

      logger.warn({ contentType }, "Music response was not audio");
      return null;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503 && attempt < MAX_RETRIES) {
        const delay = COLD_START_DELAY_MS * attempt;
        logger.warn(
          { attempt, delay, status },
          "Music model cold start (503) — waiting before retry"
        );
        await sleep(delay);
        continue;
      }
      logger.warn(
        { err: err?.message, status, attempt },
        "Music generation failed"
      );
      return null;
    }
  }

  return null;
}
