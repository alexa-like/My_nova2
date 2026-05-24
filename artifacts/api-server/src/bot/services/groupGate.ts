import TelegramBot from "node-telegram-bot-api";
import { getOrCreateBotConfig, invalidateBotConfigCache, IMandatoryGroup } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

// ── Promotional channel reward (coins per join) ───────────────────────────────
export const PROMO_REWARD_COINS = 50;

// ── Check if a user is a member of a Telegram group ──────────────────────────

export async function isUserInGroup(bot: TelegramBot, chatId: number, userId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

// ── Get all promotional channels (formerly mandatory groups) ──────────────────

export async function getMandatoryGroups(): Promise<IMandatoryGroup[]> {
  try {
    const config = await getOrCreateBotConfig();
    return (config as any).mandatoryGroups as IMandatoryGroup[] ?? [];
  } catch {
    return [];
  }
}

// ── Get channels the user is NOT in (for reward prompts) ─────────────────────

export async function getFailedGroups(
  bot: TelegramBot,
  userId: number
): Promise<IMandatoryGroup[]> {
  const groups = await getMandatoryGroups();
  const failed: IMandatoryGroup[] = [];
  for (const g of groups) {
    if (!g.chatId || g.chatId === 0) continue;
    const inGroup = await isUserInGroup(bot, g.chatId, userId);
    if (!inGroup) failed.push(g);
  }
  return failed;
}

// ── Send promotional channel invite (optional, coin-based reward) ─────────────

export async function sendPromoChannelMessage(
  bot: TelegramBot,
  userId: number,
  channels: IMandatoryGroup[]
): Promise<void> {
  if (channels.length === 0) return;
  const channelButtons = channels.map(g => [{ text: `📢 Join ${g.name}`, url: g.link }]);
  try {
    await bot.sendMessage(
      userId,
      `🎁 Earn ${PROMO_REWARD_COINS} coins per channel!\n\n` +
      `Join our channels to earn free credits — completely optional:\n\n` +
      channels.map(g => `• ${g.name}`).join("\n") +
      `\n\nJoin, then tap the button below to claim your reward!`,
      {
        reply_markup: {
          inline_keyboard: [
            ...channelButtons,
            [{ text: `✅ Claim My +${PROMO_REWARD_COINS} Coins`, callback_data: "promo_verify" }],
            [{ text: "⬅️ Skip for now", callback_data: "main_menu" }],
          ],
        },
      }
    );
  } catch { /* User may have blocked the bot */ }
}

// ── Legacy: kept for compatibility (no longer blocks bot use) ─────────────────

export async function sendGroupGateMessage(
  bot: TelegramBot,
  userId: number,
  channels: IMandatoryGroup[]
): Promise<void> {
  return sendPromoChannelMessage(bot, userId, channels);
}

// ── No-op: no longer send "you left" messages ─────────────────────────────────

export async function sendLeftGroupDM(
  _bot: TelegramBot,
  _userId: number,
  _group: IMandatoryGroup
): Promise<void> {
  // Removed: users should not be penalised for leaving a channel
}

// ── Set the chat ID for a promotional channel ─────────────────────────────────

export async function setMandatoryGroupChatId(
  index: number,
  chatId: number
): Promise<boolean> {
  try {
    const { BotConfig } = await import("../models/BotConfig.js");
    const config = await BotConfig.findOne();
    if (!config) return false;
    const groups: IMandatoryGroup[] = (config as any).mandatoryGroups ?? [];
    if (index < 0 || index >= groups.length) return false;
    groups[index].chatId = chatId;
    await BotConfig.updateOne({}, { $set: { mandatoryGroups: groups } });
    invalidateBotConfigCache();
    return true;
  } catch (err) {
    logger.warn({ err }, "setMandatoryGroupChatId failed");
    return false;
  }
}

// ── Add a new promotional channel ─────────────────────────────────────────────

export async function addMandatoryGroup(
  name: string,
  link: string,
  chatId = 0,
  strict = false
): Promise<void> {
  const { BotConfig } = await import("../models/BotConfig.js");
  await BotConfig.updateOne(
    {},
    { $push: { mandatoryGroups: { name, link, chatId, strict } } }
  );
  invalidateBotConfigCache();
}

// ── Remove a promotional channel by index ─────────────────────────────────────

export async function removeMandatoryGroup(index: number): Promise<boolean> {
  try {
    const { BotConfig } = await import("../models/BotConfig.js");
    const config = await BotConfig.findOne();
    if (!config) return false;
    const groups: IMandatoryGroup[] = (config as any).mandatoryGroups ?? [];
    if (index < 0 || index >= groups.length) return false;
    groups.splice(index, 1);
    await BotConfig.updateOne({}, { $set: { mandatoryGroups: groups } });
    invalidateBotConfigCache();
    return true;
  } catch {
    return false;
  }
}

// ── No-op seed: do not auto-seed any default mandatory group ──────────────────

export async function seedDefaultMandatoryGroup(): Promise<void> {
  // Intentionally empty: no default channels are seeded automatically.
}
