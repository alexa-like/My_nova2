/**
 * In-memory store for multi-step interactions.
 * For example: user clicks "Edit Image" button → bot sets pending → user sends photo → bot processes.
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

export type PendingActionType = PendingTextAction | PendingPhotoAction;

export const PHOTO_ACTIONS = new Set<PendingActionType>(["img_edit", "img_enhance", "img_stylize", "img_restore"]);

interface PendingAction {
  type: PendingActionType;
  data?: Record<string, string>;
  expiresAt: number;
}

const store = new Map<number, PendingAction>();

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function setPending(userId: number, type: PendingActionType, data?: Record<string, string>): void {
  store.set(userId, { type, data, expiresAt: Date.now() + TTL_MS });
}

export function getPending(userId: number): PendingAction | null {
  const p = store.get(userId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { store.delete(userId); return null; }
  return p;
}

export function clearPending(userId: number): void {
  store.delete(userId);
}
