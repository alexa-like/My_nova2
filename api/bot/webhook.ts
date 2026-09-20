import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processWebhookUpdate, startBot } from "../../artifacts/api-server/src/bot/index.js";

let initialized: Promise<void> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (expectedSecret && providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid Telegram update" });
  }

  if (!initialized) initialized = startBot();
  try {
    await initialized;
    processWebhookUpdate(req.body as object);
    return res.status(200).json({ ok: true });
  } catch (error) {
    initialized = undefined;
    console.error("[telegram-webhook]", error);
    return res.status(500).json({ error: "Webhook unavailable" });
  }
}
