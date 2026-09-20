import { createSupabaseModel } from "../../lib/supabase-model.js";
export type AnalyticsEvent = any;
export const Analytics: any = createSupabaseModel("bot_events");
