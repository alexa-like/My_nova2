import TelegramBot from "node-telegram-bot-api";
import { User, IUser } from "../models/User.js";

export async function ensureUser(msg: TelegramBot.Message): Promise<IUser> {
  const from = msg.from!;

  // Always resolve owner status from env — handles the case where OWNER_ID was
  // set after the owner's user row was first created.
  const ownerIdStr = process.env.OWNER_ID;
  const ownerId = ownerIdStr ? parseInt(ownerIdStr) : null;
  const currentIsOwner = ownerId !== null && from.id === ownerId;

  let user = await User.findOne({ userId: from.id });
  if (!user) {
    user = new User({
      userId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      isOwner: currentIsOwner,
    });
    await user.save();
  } else {
    user.lastSeen = new Date();
    if (from.username) user.username = from.username;
    if (from.first_name) user.firstName = from.first_name;
    // Always sync isOwner in case OWNER_ID was changed or set after first message
    user.isOwner = currentIsOwner;
    await user.save();
  }

  // Reset daily usage if needed
  const now = new Date();
  const lastReset = user.usage.lastReset;
  const daysSince =
    (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 1) {
    user.usage.messages = 0;
    user.usage.images = 0;
    user.usage.lastReset = now;
    await user.save();
  }

  // Expire premium if needed
  if (user.premium.active && user.premium.expiresAt) {
    if (now > user.premium.expiresAt) {
      user.premium.active = false;
      user.premium.plan = undefined;
      await user.save();
    }
  }

  return user;
}

export function isOwner(user: IUser): boolean {
  return user.isOwner;
}

export function isPremium(user: IUser): boolean {
  return user.premium.active;
}
