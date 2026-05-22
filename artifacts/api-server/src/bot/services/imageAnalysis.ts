import axios from "axios";
import { logger } from "../../lib/logger.js";

const BLIP_CAPTION_ENDPOINT =
  "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

const BLIP_VQA_ENDPOINT =
  "https://api-inference.huggingface.co/models/Salesforce/blip-vqa-base";

// X-Wait-For-Model ensures we wait for cold-start instead of getting a 503

/**
 * Analyze an image — describe it or answer a question about it.
 * If `question` is provided, runs VQA. Otherwise runs captioning.
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  question?: string
): Promise<string | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const base64Image = imageBuffer.toString("base64");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (question) {
        logger.info({ question, attempt }, "Running BLIP VQA");
        const response = await axios.post(
          BLIP_VQA_ENDPOINT,
          { inputs: { image: base64Image, question } },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Wait-For-Model": "true",
            },
            timeout: 60000,
          }
        );
        const answer = response.data?.[0]?.answer || response.data?.answer;
        if (answer) {
          logger.info({ answer }, "BLIP VQA success");
          return String(answer);
        }
      } else {
        logger.info({ attempt }, "Running BLIP captioning");
        const response = await axios.post(
          BLIP_CAPTION_ENDPOINT,
          imageBuffer,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "image/jpeg",
              "X-Wait-For-Model": "true",
            },
            timeout: 60000,
          }
        );
        const caption =
          response.data?.[0]?.generated_text || response.data?.generated_text;
        if (caption) {
          logger.info({ caption }, "BLIP caption success");
          return String(caption);
        }
      }
      logger.warn({ attempt }, "BLIP returned empty result");
      return null;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503 && attempt === 1) {
        logger.warn("Image analysis model loading (503) — waiting before retry");
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      logger.warn({ err: err?.message, status, attempt }, "Image analysis failed");
      return null;
    }
  }
  return null;
}
