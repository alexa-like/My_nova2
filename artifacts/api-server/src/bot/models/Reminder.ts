import { createSupabaseModel } from "../../lib/supabase-model.js";
export type IReminder = any;
export const Reminder: any = createSupabaseModel("bot_events");
export function parseDurationToMs(value: string): number { const match = value.match(/^(\\d+)([smhd])$/i); if (!match) return 0; const n = Number(match[1]); return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 } as any)[match[2].toLowerCase()]; }
