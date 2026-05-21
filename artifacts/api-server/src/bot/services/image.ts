import axios from "axios";
import { logger } from "../../lib/logger.js";

const FREE_LIMIT = 3;
const PREMIUM_LIMIT = 20;

const PRIMARY_ENDPOINT =
  "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers";

const FALLBACK_ENDPOINT =
  "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";

const IMG2IMG_ENDPOINT =
  "https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix";

export async function generateImage(prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const endpoints = [PRIMARY_ENDPOINT, FALLBACK_ENDPOINT];

  for (const url of endpoints) {
    try {
      logger.info({ url }, "Attempting image generation");

      const response = await axios.post(
        url,
        { inputs: prompt },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "image/png",
          },
          responseType: "arraybuffer",
          timeout: 90000,
        }
      );

      const contentType = (response.headers["content-type"] as string) || "";
      if (contentType.includes("image") || response.data?.byteLength > 1000) {
        logger.info({ url }, "Image generated successfully");
        return Buffer.from(response.data);
      }

      logger.warn({ url, contentType }, "Response was not an image, trying fallback");
    } catch (err: any) {
      const status = err?.response?.status;
      logger.warn({ url, status }, "Image generation failed for endpoint, trying next");
    }
  }

  return null;
}

/**
 * Edit an existing image using a text instruction (img2img).
 * Uses InstructPix2Pix — handles both raw binary and JSON base64 responses.
 * Falls back to text-to-image if img2img fails.
 */
export async function editImage(imageBuffer: Buffer, prompt: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) return null;

  const base64Image = imageBuffer.toString("base64");

  try {
    logger.info({ endpoint: IMG2IMG_ENDPOINT }, "Attempting img2img");

    const response = await axios.post(
      IMG2IMG_ENDPOINT,
      {
        inputs: base64Image,
        parameters: {
          prompt,
          num_inference_steps: 20,
          image_guidance_scale: 1.5,
          guidance_scale: 7,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 90000,
      }
    );

    const contentType = (response.headers["content-type"] as string) || "";
    const rawData = response.data as Buffer;

    // Case 1: Raw image bytes returned directly
    if (contentType.includes("image") && rawData?.byteLength > 1000) {
      logger.info("img2img succeeded (raw binary)");
      return Buffer.from(rawData);
    }

    // Case 2: JSON response — HuggingFace wraps image in JSON
    // Shape: [{ "generated_image": "base64..." }] or { "image": "base64..." }
    try {
      const json = JSON.parse(rawData.toString("utf-8"));
      const b64 =
        (Array.isArray(json) ? json[0]?.generated_image : json?.generated_image) ||
        json?.image ||
        (Array.isArray(json) ? json[0]?.image : null);

      if (b64 && typeof b64 === "string") {
        logger.info("img2img succeeded (JSON base64)");
        return Buffer.from(b64, "base64");
      }
    } catch {
      // Not valid JSON — if bytes are large enough, treat as raw image
      if (rawData?.byteLength > 1000) {
        logger.info("img2img succeeded (raw, non-image content-type)");
        return Buffer.from(rawData);
      }
    }

    logger.warn({ contentType, byteLength: rawData?.byteLength }, "img2img response unrecognised — falling back");
  } catch (err: any) {
    logger.warn({ err: err?.message, status: err?.response?.status }, "img2img failed — falling back to text generation");
  }

  // Fallback: generate a new image from the prompt
  return generateImage(prompt);
}

/**
 * Download an image from Telegram's CDN using a file_id.
 */
export async function downloadTelegramPhoto(
  bot: import("node-telegram-bot-api"),
  fileId: string
): Promise<Buffer | null> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const file = await bot.getFile(fileId);
    if (!file.file_path) return null;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
    return Buffer.from(response.data);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to download Telegram photo");
    return null;
  }
}

export function getImageLimit(isPremium: boolean): number {
  return isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
}

// ── Style presets ──────────────────────────────────────────────────────────

const STYLE_PRESETS: Record<string, string> = {
  anime:
    "anime style, vibrant colors, cel-shaded, sharp outlines, Studio Ghibli inspired, beautiful",
  realistic:
    "photorealistic, 8K resolution, ultra-detailed, professional photography, natural lighting",
  oil:
    "oil painting, thick brushstrokes, impressionist style, canvas texture, rich colors, museum quality",
  watercolor:
    "watercolor painting, soft washes, delicate brushwork, pastel tones, artistic",
  cyberpunk:
    "cyberpunk style, neon lights, futuristic city, rain-slicked streets, dark atmosphere, cinematic",
  fantasy:
    "fantasy art, magical, ethereal lighting, epic scale, detailed world-building, concept art",
  sketch:
    "pencil sketch, detailed line art, black and white, cross-hatching, professional illustration",
  pixel:
    "pixel art, 16-bit style, retro game aesthetic, vibrant palette, crisp pixels",
};

/**
 * Apply a named style preset to a prompt.
 * Returns the original prompt if preset is not recognized.
 */
export function applyStylePreset(prompt: string, preset?: string): string {
  if (!preset) return prompt;
  const style = STYLE_PRESETS[preset.toLowerCase()];
  if (!style) return prompt;
  return `${prompt}, ${style}`;
}

export function listStylePresets(): string[] {
  return Object.keys(STYLE_PRESETS);
}
