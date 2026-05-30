import TelegramBot from "node-telegram-bot-api";
import { User } from "../models/User.js";
import { addCredits } from "./credits.js";
import { addDays } from "../utils/helpers.js";
import { logger } from "../../lib/logger.js";

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  stars: number;
  badge: string;
}

export interface PremiumPlan {
  id: string;
  label: string;
  days: number;
  stars: number;
  badge: string;
  description: string;
}

export const STAR_PACKS: CreditPack[] = [
  { id: "pack_50",   label: "Starter Pack",  credits: 50,   stars: 15,  badge: "🌱" },
  { id: "pack_150",  label: "Basic Pack",    credits: 150,  stars: 40,  badge: "⚡" },
  { id: "pack_500",  label: "Pro Pack",      credits: 500,  stars: 115, badge: "🚀" },
  { id: "pack_1500", label: "Power Pack",    credits: 1500, stars: 299, badge: "💎" },
];

export const STAR_PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: "vip_monthly",
    label: "VIP Monthly",
    days: 30,
    stars: 149,
    badge: "⭐",
    description: "30 days of unlimited images, priority AI, all premium modes, no credit limits.",
  },
  {
    id: "vip_lifetime",
    label: "VIP Lifetime",
    days: -1,
    stars: 499,
    badge: "👑",
    description: "Lifetime VIP access — never expires. Everything in VIP, forever.",
  },
];

export function hasAnyPaymentProvider(): boolean {
  return true;
}

export async function sendStarsInvoice(
  bot: TelegramBot,
  chatId: number,
  itemId: string
): Promise<void> {
  const pack = STAR_PACKS.find(p => p.id === itemId);
  const plan = STAR_PREMIUM_PLANS.find(p => p.id === itemId);

  if (pack) {
    await (bot as any).sendInvoice(
      chatId,
      `${pack.badge} ${pack.label} — ${pack.credits} Credits`,
      `Get ${pack.credits} credits for AI chat, image generation, builds, and voice messages. Credits never expire.`,
      `credits:${pack.id}`,
      "",
      "XTR",
      [{ label: `${pack.credits} Credits`, amount: pack.stars }]
    );
    return;
  }

  if (plan) {
    const durationText = plan.days === -1 ? "Lifetime" : `${plan.days} Days`;
    await (bot as any).sendInvoice(
      chatId,
      `${plan.badge} ${plan.label} — VIP Access`,
      plan.description,
      `premium:${plan.id}`,
      "",
      "XTR",
      [{ label: `VIP ${durationText}`, amount: plan.stars }]
    );
    return;
  }

  throw new Error(`Unknown item ID: ${itemId}`);
}

export async function handleStarPayment(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  const payment = (msg as any).successful_payment;
  if (!payment) return;

  const userId = msg.from!.id;
  const chatId = msg.chat.id;
  const payload: string = payment.invoice_payload;
  const stars: number = payment.total_amount;

  logger.info({ userId, payload, stars }, "Telegram Stars payment received");

  try {
    if (payload.startsWith("credits:")) {
      const packId = payload.replace("credits:", "");
      const pack = STAR_PACKS.find(p => p.id === packId);
      if (!pack) {
        await bot.sendMessage(chatId, "Payment received but pack not found. Please contact the bot owner.");
        return;
      }
      const newBal = await addCredits(userId, pack.credits);
      await bot.sendMessage(
        chatId,
        `🎉 Payment received — thank you!\n\n${pack.badge} <b>+${pack.credits} credits</b> have been added to your account.\n💰 New balance: <b>${newBal} credits</b>\n\nCredits let you generate images, build projects, and use premium AI features. Enjoy! 🚀`,
        { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "💰 View Credits", callback_data: "credits_menu" }, { text: "🏠 Main Menu", callback_data: "main_menu" }]] } }
      );

    } else if (payload.startsWith("premium:")) {
      const planId = payload.replace("premium:", "");
      const plan = STAR_PREMIUM_PLANS.find(p => p.id === planId);
      if (!plan) {
        await bot.sendMessage(chatId, "Payment received but plan not found. Please contact the bot owner.");
        return;
      }
      const expiresAt = plan.days === -1 ? undefined : addDays(new Date(), plan.days);
      await User.updateOne(
        { userId },
        { $set: { "premium.active": true, "premium.expiresAt": expiresAt, "premium.plan": plan.id } }
      );
      const durationText = plan.days === -1 ? "Lifetime" : `${plan.days} days`;
      await bot.sendMessage(
        chatId,
        `🎉 Welcome to Premium!\n\n${plan.badge} <b>You are now a VIP member!</b>\n\n` +
        `⏱ Duration: <b>${durationText}</b>\n📅 Expires: <b>${expiresAt ? expiresAt.toDateString() : "Never (Lifetime!)"}</b>\n\n` +
        `✨ <b>What you unlocked:</b>\n` +
        `• 🎨 Up to 20 images per day\n` +
        `• 🧠 Priority AI with smarter responses\n` +
        `• 💬 Higher daily message limit\n` +
        `• 🏗️ More daily builds\n` +
        `• 🚫 No credit deductions\n\n` +
        `Thank you so much for your support — it means the world! 🙏`,
        { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "💎 View Premium Status", callback_data: "settings_premium" }, { text: "🏠 Main Menu", callback_data: "main_menu" }]] } }
      );

    } else {
      logger.warn({ payload }, "Unknown Stars payment payload");
      await bot.sendMessage(chatId, "Payment received. If your reward wasn't applied automatically, please contact the bot owner with your payment confirmation.");
    }
  } catch (err) {
    logger.error({ err, userId, payload }, "Error processing Star payment");
    await bot.sendMessage(chatId, "Payment received but something went wrong applying it. Please contact the bot owner with your Telegram payment confirmation.");
  }
}
