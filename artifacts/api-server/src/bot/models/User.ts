import { createSupabaseModel } from "../../lib/supabase-model.js";
export type IUser = any;
export const User: any = createSupabaseModel("bot_users", "telegram_user_id");
