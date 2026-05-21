/**
 * In-memory store for multi-step interactions.
 * TTL: 5 minutes. Cleared after use or expiry.
 */

export type PendingTextAction =
  | "ai_ask"
  | "ai_translate"
  | "ai_generate"
  | "ai_summarize_input"
  | "ai_debate"
  | "ai_analyze"
  | "img_generate_text"
  | "fun_8ball"
  | "fun_ship"
  | "fun_roast_name"
  | "fun_truth_reply"
  | "write_tweet"
  | "write_caption"
  | "write_bio"
  | "write_poem"
  | "write_email"
  | "write_lyrics";

export type PendingPhotoAction =
  | "img_edit"
  | "img_enhance"
  | "img_stylize"
  | "img_restore";

export type OwnerPendingAction =
  | "owner_lookup"
  | "owner_ban"
  | "owner_unban"
  | "owner_deleteuser"
  | "owner_cleardata"
  | "owner_grantpremium"
  | "owner_revokepremium"
  | "owner_broadcast"
  | "owner_announcement"
  | "owner_schedule"
  | "owner_createcode"
  | "owner_resetcode"
  | "owner_deletegroup"
  // Two-step model adding (step1 = name, step2 = model ID)
  | "owner_add_chat_step1"
  | "owner_add_chat_step2"
  | "owner_add_img_step1"
  | "owner_add_img_step2"
  | "owner_add_vid_step1"
  | "owner_add_vid_step2"
  | "owner_add_voice_step1"
  | "owner_add_voice_step2"
  | "owner_add_asr_step1"
  | "owner_add_asr_step2"
  // Legacy single-step (kept for backwards compat)
  | "owner_add_chat_model"
  | "owner_add_image_model"
  | "owner_add_video_model";

export type PendingActionType =
  | PendingTextAction
  | PendingPhotoAction
  | OwnerPendingAction;

export const PHOTO_ACTIONS = new Set<PendingActionType>([
  "img_edit",
  "img_enhance",
  "img_stylize",
  "img_restore",
]);

export const OWNER_PENDING_ACTIONS = new Set<PendingActionType>([
  "owner_lookup",
  "owner_ban",
  "owner_unban",
  "owner_deleteuser",
  "owner_cleardata",
  "owner_grantpremium",
  "owner_revokepremium",
  "owner_broadcast",
  "owner_announcement",
  "owner_schedule",
  "owner_createcode",
  "owner_resetcode",
  "owner_deletegroup",
  "owner_add_chat_step1",
  "owner_add_chat_step2",
  "owner_add_img_step1",
  "owner_add_img_step2",
  "owner_add_vid_step1",
  "owner_add_vid_step2",
  "owner_add_voice_step1",
  "owner_add_voice_step2",
  "owner_add_asr_step1",
  "owner_add_asr_step2",
  "owner_add_chat_model",
  "owner_add_image_model",
  "owner_add_video_model",
]);

interface PendingAction {
  type: PendingActionType;
  data?: Record<string, string>;
  expiresAt: number;
}

const store = new Map<number, PendingAction>();

const TTL_MS = 5 * 60 * 1000;

export function setPending(
  userId: number,
  type: PendingActionType,
  data?: Record<string, string>
): void {
  store.set(userId, { type, data, expiresAt: Date.now() + TTL_MS });
}

export function getPending(userId: number): PendingAction | null {
  const p = store.get(userId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    store.delete(userId);
    return null;
  }
  return p;
}

export function clearPending(userId: number): void {
  store.delete(userId);
}
