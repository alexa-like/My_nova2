import mongoose, { Document, Schema } from "mongoose";

export interface IMemory extends Document {
  userId: number;
  chatId: number;
  messages: Array<{ role: "user" | "assistant"; content: string; ts: Date }>;
  summary?: string;
  updatedAt: Date;
}

const MemorySchema = new Schema<IMemory>(
  {
    userId: { type: Number, required: true, index: true },
    chatId: { type: Number, required: true, index: true },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        ts: { type: Date, default: Date.now },
      },
    ],
    summary: { type: String },
  },
  { timestamps: true }
);

MemorySchema.index({ userId: 1, chatId: 1 }, { unique: true });

export const Memory = mongoose.model<IMemory>("Memory", MemorySchema);
