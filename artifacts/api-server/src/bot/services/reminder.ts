import TelegramBot from "node-telegram-bot-api";
import { Reminder, IReminder } from "../models/Reminder.js";
import { logger } from "../../lib/logger.js";

const activeTimers = new Map<string, NodeJS.Timeout>();

export async function scheduleReminder(
  bot: TelegramBot,
  reminder: IReminder
): Promise<void> {
  const id = (reminder._id as any).toString();
  const delay = reminder.triggerAt.getTime() - Date.now();

  if (delay <= 0) {
    await fireReminder(bot, reminder);
    return;
  }

  if (activeTimers.has(id)) clearTimeout(activeTimers.get(id)!);

  const timer = setTimeout(async () => {
    activeTimers.delete(id);
    await fireReminder(bot, reminder);
  }, delay);

  activeTimers.set(id, timer);
  logger.info({ id, delayMs: delay, userId: reminder.userId }, "Reminder scheduled");
}

async function fireReminder(bot: TelegramBot, reminder: IReminder): Promise<void> {
  const id = (reminder._id as any).toString();
  try {
    await bot.sendMessage(
      reminder.chatId,
      `⏰ Reminder!\n\n${reminder.message}`,
      { reply_markup: { inline_keyboard: [[{ text: "⬅️ Back to Menu", callback_data: "main_menu" }]] } }
    );
    await Reminder.findByIdAndUpdate(id, { sent: true });
    logger.info({ id, userId: reminder.userId }, "Reminder fired");
  } catch (err) {
    logger.warn({ err, id }, "Failed to fire reminder");
  }
}

export async function loadPendingReminders(bot: TelegramBot): Promise<void> {
  const pending = await Reminder.find({ sent: false });
  logger.info({ count: pending.length }, "Loading pending reminders");
  for (const r of pending) {
    await scheduleReminder(bot, r);
  }
}

export async function createReminder(
  bot: TelegramBot,
  userId: number,
  chatId: number,
  message: string,
  triggerAt: Date
): Promise<IReminder> {
  const reminder = new Reminder({ userId, chatId, message, triggerAt, sent: false });
  await reminder.save();
  await scheduleReminder(bot, reminder);
  return reminder;
}

export async function listUserReminders(userId: number): Promise<IReminder[]> {
  return Reminder.find({ userId, sent: false, triggerAt: { $gt: new Date() } })
    .sort({ triggerAt: 1 })
    .limit(10);
}

export async function cancelReminder(reminderId: string, userId: number): Promise<boolean> {
  const r = await Reminder.findOne({ _id: reminderId, userId, sent: false });
  if (!r) return false;
  const timer = activeTimers.get(reminderId);
  if (timer) { clearTimeout(timer); activeTimers.delete(reminderId); }
  await Reminder.findByIdAndUpdate(reminderId, { sent: true });
  return true;
}
