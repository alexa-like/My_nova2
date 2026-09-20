import { createSupabaseModel } from "../../lib/supabase-model.js";
export type IModelEntry = any;
export const BotConfig: any = createSupabaseModel("bot_config");
export async function getOrCreateBotConfig(): Promise<any> { const rows = await BotConfig.find({ id: true }); return rows[0] ?? BotConfig.create({ id: true }); }
export function invalidateBotConfigCache() {}
