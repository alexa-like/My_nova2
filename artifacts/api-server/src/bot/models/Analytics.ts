import mongoose, { Document, Schema } from "mongoose";

export type AnalyticsEvent =
  | "message"
  | "image_gen"
  | "image_edit"
  | "command"
  | "new_user"
  | "premium_redeemed"
  | "error"
  | "ban"
  | "warn"
  | "mute"
  | "inline_query";

export interface IAnalytics extends Document {
  event: AnalyticsEvent;
  userId?: number;
  chatId?: number;
  meta?: Record<string, unknown>;
  ts: Date;
}

const AnalyticsSchema = new Schema<IAnalytics>(
  {
    event: {
      type: String,
      required: true,
      enum: [
        "message",
        "image_gen",
        "image_edit",
        "command",
        "new_user",
        "premium_redeemed",
        "error",
        "ban",
        "warn",
        "mute",
        "inline_query",
      ],
      index: true,
    },
    userId: { type: Number, index: true },
    chatId: { type: Number },
    meta: { type: Schema.Types.Mixed },
    ts: { type: Date, default: Date.now, index: true },
  },
  { capped: { size: 50 * 1024 * 1024, max: 100_000 } }
);

export const Analytics = mongoose.model<IAnalytics>("Analytics", AnalyticsSchema);
