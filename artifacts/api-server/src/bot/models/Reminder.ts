import mongoose, { Document, Schema } from "mongoose";

export interface IReminder extends Document {
  userId: number;
  chatId: number;
  message: string;
  triggerAt: Date;
  sent: boolean;
  createdAt: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    userId:    { type: Number, required: true, index: true },
    chatId:    { type: Number, required: true },
    message:   { type: String, required: true },
    triggerAt: { type: Date, required: true, index: true },
    sent:      { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Auto-delete fired reminders 30 days after they triggered
ReminderSchema.index({ triggerAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { sent: true } });

export const Reminder = mongoose.model<IReminder>("Reminder", ReminderSchema);

export function parseDurationToMs(input: string): number | null {
  const s = input.trim().toLowerCase();
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  const unit = match[2];
  if (unit.startsWith("s")) return Math.floor(n * 1000);
  if (unit.startsWith("m")) return Math.floor(n * 60 * 1000);
  if (unit.startsWith("h")) return Math.floor(n * 3600 * 1000);
  if (unit.startsWith("d")) return Math.floor(n * 86400 * 1000);
  return null;
}
