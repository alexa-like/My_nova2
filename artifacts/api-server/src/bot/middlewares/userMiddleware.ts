import TelegramBot from "node-telegram-bot-api";
import { User, IUser } from "../models/User.js";

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
    });
    await user.save();
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
  }

  // Reset daily usage if needed
  const lastReset = user.usage.lastReset;
  const daysSince = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 1) {
    user.usage.messages  = 0;
    user.usage.images    = 0;
    user.usage.lastReset = now;
    dirty = true;
  }

  // Expire premium if needed
  if (user.premium.active && user.premium.expiresAt && now > user.premium.expiresAt) {
    user.premium.active = false;
    user.premium.plan   = undefined;
    dirty = true;
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
