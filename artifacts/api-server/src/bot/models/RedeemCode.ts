import { createSupabaseModel } from "../../lib/supabase-model.js";
export const RedeemCode: any = createSupabaseModel("redeem_codes");
export function parseDuration(value: string): number { const match = value.match(/^(\\d+)([smhdwy])$/i); if (!match) return 0; return Number(match[1]); }
