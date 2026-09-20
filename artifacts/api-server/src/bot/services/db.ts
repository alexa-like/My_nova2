import { hasSupabaseConfig } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";

export async function connectDB(): Promise<void> {
  if (!hasSupabaseConfig()) throw new Error("Supabase server credentials are not configured");
  logger.info("Supabase server client ready");
}

export async function disconnectDB(): Promise<void> {}
