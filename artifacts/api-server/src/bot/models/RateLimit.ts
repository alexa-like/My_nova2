import mongoose, { Document, Schema } from "mongoose";

export interface IRateLimit extends Document {
  userId: number;
  hits: number[];
  updatedAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    userId:    { type: Number, required: true, unique: true, index: true },
    hits:      { type: [Number], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

RateLimitSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 120 });

export const RateLimit = mongoose.model<IRateLimit>("RateLimit", RateLimitSchema);
