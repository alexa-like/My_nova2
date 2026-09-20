import { createSupabaseModel } from "../../lib/supabase-model.js";
export const GroupSettings: any = createSupabaseModel("bot_groups", "chat_id");
