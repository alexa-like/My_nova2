import TelegramBot from "node-telegram-bot-api";
import { PromoGroup, IPromoGroup } from "../models/PromoGroup.js";
import { User } from "../models/User.js";
import { logger } from "../../lib/logger.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extractUsernameFromLink(link: string): string | null {
  const clean = link.trim();
  // https://t.me/username  or  t.me/username (public groups only — not invite links)
  const match = clean.match(/(?:https?:\/\/)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,})$/);
  return match ? `@${match[1]}` : null;
}

export type MembershipStatus = "member" | "not_member" | "unverifiable";

export async function checkMembership(
  bot: TelegramBot,
  identifier: string | number,
  userId: number
): Promise<MembershipStatus> {
  try {
    const member = await bot.getChatMember(identifier as any, userId);
    const active = ["member", "administrator", "creator"].includes(member.status);
    return active ? "member" : "not_member";
  } catch (err: any) {
    // Bot is not in the group, group not found, or private invite link used —
    // we can't verify, so give benefit of the doubt.
    logger.warn(
      { err: err?.message, identifier, userId },
      "checkMembership: cannot verify (bot not in group or invalid identifier) — treating as unverifiable"
    );
    return "unverifiable";
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getPromoGroups(): Promise<IPromoGroup[]> {
  try {
    return await PromoGroup.find().sort({ createdAt: -1 });
  } catch {
    return [];
  }
}

export async function getActivePromoGroups(): Promise<IPromoGroup[]> {
  try {
    return await PromoGroup.find({ active: true }).sort({ createdAt: -1 });
  } catch {
    return [];
  }
}

export async function addPromoGroup(
  title: string,
  link: string,
  reward: number,
  addedBy: number
): Promise<IPromoGroup> {
  const username = extractUsernameFromLink(link) ?? undefined;
  const promo = new PromoGroup({ title, link, username, reward, active: true, addedBy, verifiedUsers: [] });
  await promo.save();
  return promo;
}

export async function removePromoGroup(id: string): Promise<boolean> {
  try {
    const result = await PromoGroup.deleteOne({ _id: id });
    return result.deletedCount > 0;
  } catch {
    return false;
  }
}

export async function togglePromoGroup(id: string): Promise<boolean | null> {
  try {
    const promo = await PromoGroup.findById(id);
    if (!promo) return null;
    promo.active = !promo.active;
    await promo.save();
    return promo.active;
  } catch {
    return null;
  }
}

// ── Claim reward ──────────────────────────────────────────────────────────────

export type ClaimResult =
  | { status: "awarded"; reward: number }
  | { status: "already_claimed" }
  | { status: "not_member" }
  | { status: "not_found" }
  | { status: "inactive" };

export async function claimPromoReward(
  bot: TelegramBot,
  userId: number,
  promoId: string
): Promise<ClaimResult> {
  try {
    const promo = await PromoGroup.findById(promoId);
    if (!promo) return { status: "not_found" };
    if (!promo.active) return { status: "inactive" };

    if (promo.verifiedUsers.includes(userId)) return { status: "already_claimed" };

    // Use username for public groups; fall back to full link for private/invite links
    const identifier: string | number = promo.username ?? promo.link;
    const membershipStatus = await checkMembership(bot, identifier, userId);

    // Only block if we can confirm the user is NOT in the group.
    // "unverifiable" means the bot isn't in the group or the link is private —
    // give benefit of the doubt and award the coins.
    if (membershipStatus === "not_member") return { status: "not_member" };

    await PromoGroup.updateOne(
      { _id: promoId },
      { $addToSet: { verifiedUsers: userId } }
    );
    await User.updateOne({ userId }, { $inc: { credits: promo.reward } });

    return { status: "awarded", reward: promo.reward };
  } catch (err) {
    logger.warn({ err, userId, promoId }, "claimPromoReward failed");
    return { status: "not_found" };
  }
}

// ── Broadcast new promo to all users ─────────────────────────────────────────

export async function broadcastNewPromo(
  bot: TelegramBot,
  promo: IPromoGroup
): Promise<{ sent: number; failed: number }> {
  const users = await User.find({ banned: { $ne: true } }).select("userId").lean();
  let sent = 0;
  let failed = 0;
  const promoId = (promo._id as any).toString();
  for (const u of users) {
    try {
      await bot.sendMessage(
        u.userId,
        `🪙 New Coin Opportunity!\n\n` +
        `📢 *${promo.title}*\n\n` +
        `Join this group and earn *${promo.reward} coins* instantly!\n\n` +
        `Tap the button below to view and claim your reward:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: `🌐 View & Earn ${promo.reward} Coins`, callback_data: `promo_view_${promoId}` }],
              [{ text: "⬅️ Not Now", callback_data: "main_menu" }],
            ],
          },
        }
      );
      sent++;
      // Small delay to avoid hitting Telegram rate limits
      await new Promise(r => setTimeout(r, 35));
    } catch {
      failed++;
    }
  }
  logger.info({ sent, failed, promoId }, "Promo broadcast complete");
  return { sent, failed };
}

// ── Legacy no-op (kept so index.ts import compiles) ──────────────────────────

export async function seedDefaultMandatoryGroup(): Promise<void> {
  // Intentionally empty
}
