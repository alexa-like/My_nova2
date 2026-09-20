import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasSupabaseConfig, getSupabaseAdmin } from "../artifacts/api-server/src/lib/supabase.js";

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  let database = "not_configured";

  if (hasSupabaseConfig()) {
    try {
      const { error } = await getSupabaseAdmin().from("bot_config").select("id").eq("id", true).maybeSingle();
      database = error ? "error" : "ok";
    } catch {
      database = "error";
    }
  }

  const healthy = database === "ok";
  return response.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "nova",
    runtime: "vercel-serverless",
    database,
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    ai: Boolean(process.env.OPENROUTER_API_KEY || process.env.AI_GATEWAY_API_KEY),
  });
}
