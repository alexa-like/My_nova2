import axios from "axios";
import { logger } from "../../lib/logger.js";

const BLIP_CAPTION_ENDPOINT =
  "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

const BLIP_VQA_ENDPOINT =
  "https://api-inference.huggingface.co/models/Salesforce/blip-vqa-base";

/**
 * Analyze an image — describe it or answer a question about it.
 * If `question` is provided, runs VQA. Otherwise runs captioning then enriches with AI.
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  question?: string
): Promise<string | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const base64Image = imageBuffer.toString("base64");

  try {
    if (question) {
      // Visual Question Answering
      logger.info({ question }, "Running BLIP VQA");
      const response = await axios.post(
        BLIP_VQA_ENDPOINT,
        { inputs: { image: base64Image, question } },
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 60000,
        }
      );
      const answer = response.data?.[0]?.answer || response.data?.answer;
      if (answer) {
        logger.info({ answer }, "BLIP VQA success");
        return String(answer);
      }
    } else {
      // Image captioning
      logger.info("Running BLIP captioning");
      const response = await axios.post(
        BLIP_CAPTION_ENDPOINT,
        imageBuffer,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "image/jpeg",
          },
          timeout: 60000,
        }
      );
      const caption = response.data?.[0]?.generated_text || response.data?.generated_text;
      if (caption) {
        logger.info({ caption }, "BLIP caption success");
        return String(caption);
      }
    }
  } catch (err: any) {
    if (err?.response?.status === 503) {
      logger.warn("Image analysis model is loading (503)");
    } else {
      logger.warn({ err: err?.message, status: err?.response?.status }, "Image analysis failed");
    }
  }

  return null;
}
