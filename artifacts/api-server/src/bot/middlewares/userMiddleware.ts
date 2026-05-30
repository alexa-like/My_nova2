import TelegramBot from "node-telegram-bot-api";
import { User, IUser } from "../models/User.js";
import { getOrCreateBotConfig } from "../models/BotConfig.js";
import { track } from "../services/analytics.js";

export async function ensureUser(msg: TelegramBot.Message): Promise<IUser> {
  const from = msg.from!;

  const ownerIdStr = process.env.OWNER_ID;
  const ownerId = ownerIdStr ? parseInt(ownerIdStr) : null;
  const currentIsOwner = ownerId !== null && from.id === ownerId;

  const now = new Date();
  let user = await User.findOne({ userId: from.id });

  if (!user) {
    user = new User({
      userId:    from.id,
      username:  from.username,
      firstName: from.first_name,
      lastName:  from.last_name,
      isOwner:   currentIsOwner,
      // Owner starts with lifetime premium automatically
      premium: currentIsOwner
        ? { active: true, plan: "owner" }
        : { active: false },
    });
    await user.save();
    track("new_user", user.userId).catch(() => {});
    return user;
  }

  // Track what actually needs to change — only write once at the end
  let dirty = false;

  user.lastSeen = now;
  dirty = true;

  if (from.username && from.username !== user.username) {
    user.username = from.username;
  }
  if (from.first_name && from.first_name !== user.firstName) {
    user.firstName = from.first_name;
  }
  if (user.isOwner !== currentIsOwner) {
    user.isOwner = currentIsOwner;
    dirty = true;
  }

  // ── Owner always has lifetime premium — enforce on every request ───────────
  if (currentIsOwner) {
    if (!user.premium.active || user.premium.plan !== "owner" || user.premium.expiresAt) {
      user.premium.active    = true;
      user.premium.plan      = "owner";
      user.premium.expiresAt = undefined;
      dirty = true;
    }
  } else {
    // Reset all daily usage counters if the configured reset interval has passed
    const lastReset = user.usage.lastReset;
    let resetIntervalMs = 24 * 60 * 60 * 1000; // default 24h
    try {
      const cfg = await getOrCreateBotConfig();
      resetIntervalMs = (cfg.usageLimits.resetIntervalHours || 24) * 60 * 60 * 1000;
    } catch {}
    if (now.getTime() - lastReset.getTime() >= resetIntervalMs) {
      user.usage.messages  = 0;
      user.usage.images    = 0;
      user.usage.builds    = 0;
      user.usage.lastReset = now;
      user.bonusImages     = 0;
      dirty = true;
    }

    // Expire premium if needed (only for non-owner users)
    if (user.premium.active && user.premium.expiresAt && now > user.premium.expiresAt) {
      user.premium.active = false;
      user.premium.plan   = undefined;
      dirty = true;
      (user as any)._premiumJustExpired = true;
    }
  }

  if (dirty) await user.save();

  return user;
}

export function isOwner(user: IUser): boolean {
  return user.isOwner;
}

export function isPremium(user: IUser): boolean {
  return user.premium.active;
}
