import axios from "axios";
import { logger } from "../../lib/logger.js";

const MAX_TEXT_LENGTH = 4000;

export async function downloadTelegramDocument(
  bot: import("node-telegram-bot-api"),
  fileId: string
): Promise<Buffer | null> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const file = await bot.getFile(fileId);
    if (!file.file_path) return null;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    return Buffer.from(response.data);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to download document");
    return null;
  }
}

export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  try {
    const mime = mimeType?.toLowerCase() || "";
    const ext = fileName?.split(".").pop()?.toLowerCase() || "";

    if (mime.includes("text") || ext === "txt" || ext === "md" || ext === "csv") {
      const text = buffer.toString("utf-8");
      return text.substring(0, MAX_TEXT_LENGTH);
    }

    if (mime === "application/pdf" || ext === "pdf") {
      try {
        const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js" as any);
        const data = await pdfParse(buffer);
        return (data.text || "").substring(0, MAX_TEXT_LENGTH);
      } catch {
        const rawText = buffer.toString("latin1");
        const extracted = rawText
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (extracted.length > 50) return extracted.substring(0, MAX_TEXT_LENGTH);
        return null;
      }
    }

    if (
      mime.includes("word") ||
      ext === "docx" ||
      ext === "doc"
    ) {
      try {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer });
        return result.value.substring(0, MAX_TEXT_LENGTH);
      } catch {
        return null;
      }
    }

    if (
      mime.includes("json") ||
      ext === "json" ||
      ext === "yaml" ||
      ext === "yml" ||
      ext === "xml" ||
      ext === "html" ||
      ext === "htm" ||
      ext === "css" ||
      ext === "js" ||
      ext === "ts" ||
      ext === "py" ||
      ext === "java" ||
      ext === "cpp" ||
      ext === "c" ||
      ext === "sh"
    ) {
      const text = buffer.toString("utf-8");
      return text.substring(0, MAX_TEXT_LENGTH);
    }

    return null;
  } catch (err: any) {
    logger.warn({ err: err?.message, mimeType, fileName }, "Document extraction failed");
    return null;
  }
}
