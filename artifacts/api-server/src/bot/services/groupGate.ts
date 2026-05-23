import TelegramBot from "node-telegram-bot-api";
import { getOrCreateBotConfig, invalidateBotConfigCache, IMandatoryGroup } from "../models/BotConfig.js";
import { logger } from "../../lib/logger.js";

// ── Check if a user is a member of a Telegram group ──────────────────────────

export async function isUserInGroup(bot: TelegramBot, chatId: number, userId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

// ── Get all mandatory groups that are active (chatId known) ───────────────────

export async function getMandatoryGroups(): Promise<IMandatoryGroup[]> {
  try {
    const config = await getOrCreateBotConfig();
    return (config as any).mandatoryGroups as IMandatoryGroup[] ?? [];
  } catch {
    return [];
  }
}

// ── Check all mandatory groups and return those the user is NOT in ────────────

export async function getFailedGroups(
  bot: TelegramBot,
  userId: number
): Promise<IMandatoryGroup[]> {
  const groups = await getMandatoryGroups();
  const failed: IMandatoryGroup[] = [];

  for (const g of groups) {
    if (!g.chatId || g.chatId === 0) continue; // ID not yet set — skip
    const inGroup = await isUserInGroup(bot, g.chatId, userId);
    if (!inGroup) failed.push(g);
  }

  return failed;
}

// ── Send "you must join" message ───────────────────────────────────────────────

export async function sendGroupGateMessage(
  bot: TelegramBot,
  userId: number,
  failedGroups: IMandatoryGroup[],
  strictOnly = false
): Promise<void> {
  const targets = strictOnly ? failedGroups.filter(g => g.strict) : failedGroups;
  if (targets.length === 0) return;

  const groupButtons = targets.map(g => [{ text: `👥 Join ${g.name}`, url: g.link }]);

  await bot.sendMessage(
    userId,
    `🔒 Access Required\n\n` +
    `To use Nova, you need to be a member of our community:\n\n` +
    targets.map(g => `• ${g.name}`).join("\n") +
    `\n\nJoin the group${targets.length > 1 ? "s" : ""} below and then send /start again.`,
    {
      reply_markup: {
        inline_keyboard: [
          ...groupButtons,
          [{ text: "✅ I Joined — Check Again", callback_data: "gate_recheck" }],
        ],
      },
    }
  );
}

// ── Send "you left the group" DM ──────────────────────────────────────────────

export async function sendLeftGroupDM(
  bot: TelegramBot,
  userId: number,
  group: IMandatoryGroup
): Promise<void> {
  try {
    await bot.sendMessage(
      userId,
      `😔 You left ${group.name}\n\n` +
      `Nova will no longer be available to you until you rejoin the group.\n\n` +
      `Tap the button below to rejoin anytime!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `👥 Rejoin ${group.name}`, url: group.link }],
          ],
        },
      }
    );
  } catch {
    // User may have blocked the bot — non-fatal
  }
}

// ── Set the chat ID for a mandatory group (owner use) ─────────────────────────

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

// ── Add a new mandatory group ─────────────────────────────────────────────────

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

// ── Remove a mandatory group by index ─────────────────────────────────────────

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

// ── Seed the default Nova mandatory group if not present ─────────────────────

export async function seedDefaultMandatoryGroup(): Promise<void> {
  try {
    const { BotConfig } = await import("../models/BotConfig.js");
    const config = await BotConfig.findOne();
    if (!config) return;
    const groups: IMandatoryGroup[] = (config as any).mandatoryGroups ?? [];
    const novaExists = groups.some(g => g.link.includes("bw--Kb7qnwZiODJk"));
    if (!novaExists) {
      groups.unshift({
        name: "Nova Community",
        link: "https://t.me/+bw--Kb7qnwZiODJk",
        chatId: 0,
        strict: true,
      });
      await BotConfig.updateOne({}, { $set: { mandatoryGroups: groups } });
      invalidateBotConfigCache();
      logger.info("Seeded default Nova mandatory group");
    }
  } catch (err) {
    logger.warn({ err }, "seedDefaultMandatoryGroup failed (non-fatal)");
  }
}
