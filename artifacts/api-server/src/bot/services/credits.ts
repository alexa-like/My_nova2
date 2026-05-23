import { User } from "../models/User.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

export type CreditAction = "chat" | "image" | "build" | "tts" | "search";

export async function getCreditCost(action: CreditAction): Promise<number> {
  const cfg = await getOrCreateBotConfig();
  return (cfg as any).creditCosts?.[action] ?? DEFAULT_COSTS[action];
}

export const DEFAULT_COSTS: Record<CreditAction, number> = {
  chat: 1,
  image: 5,
  build: 20,
  tts: 3,
  search: 2,
};

export async function getCredits(userId: number): Promise<number> {
  const user = await User.findOne({ userId }).select("credits").lean();
  return (user as any)?.credits ?? 0;
}

export async function addCredits(userId: number, amount: number): Promise<number> {
  const result = await User.findOneAndUpdate(
    { userId },
    { $inc: { credits: amount } },
    { new: true, select: "credits" }
  );
  const newBal = (result as any)?.credits ?? 0;
  logger.info({ userId, amount, newBal }, "Credits added");
  return newBal;
}

export async function deductCredits(userId: number, amount: number): Promise<{ success: boolean; credits: number }> {
  // Atomic conditional update — prevents race conditions on concurrent requests
  const result = await User.findOneAndUpdate(
    { userId, credits: { $gte: amount } },
    { $inc: { credits: -amount } },
    { new: true, select: "credits" }
  );
  if (!result) {
    const user = await User.findOne({ userId }).select("credits").lean();
    return { success: false, credits: (user as any)?.credits ?? 0 };
  }
  return { success: true, credits: (result as any).credits ?? 0 };
}

export async function resetCredits(userId: number, amount?: number): Promise<void> {
  const cfg = await getOrCreateBotConfig();
  const resetTo = amount ?? (cfg as any).creditRewards?.freeStarting ?? 50;
  await User.updateOne({ userId }, { credits: resetTo });
}

export async function setCredits(userId: number, amount: number): Promise<void> {
  await User.updateOne({ userId }, { credits: Math.max(0, amount) });
}

export async function hasSufficientCredits(userId: number, cost: number): Promise<boolean> {
  const user = await User.findOne({ userId }).select("credits premium").lean();
  if ((user as any)?.premium?.active) return true;
  return ((user as any)?.credits ?? 0) >= cost;
}
