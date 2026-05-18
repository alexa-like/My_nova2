import mongoose, { Document, Schema } from "mongoose";

export interface IRedeemCode extends Document {
  code: string;
  duration: string;
  durationDays: number;
  used: boolean;
  usedBy?: number;
  usedAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
  createdBy: number;
}

function parseDuration(duration: string): number {
  if (!duration) return 30;
  const d = duration.toLowerCase().trim();
  if (d === "lifetime") return 99999;
  const match = d.match(/^(\d+)(d|m|y)$/);
  if (!match) return 30;
  const n = parseInt(match[1]);
  if (match[2] === "d") return n;
  if (match[2] === "m") return n * 30;
  if (match[2] === "y") return n * 365;
  return 30;
}

const RedeemCodeSchema = new Schema<IRedeemCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    duration: { type: String, required: true },
    durationDays: { type: Number, required: true },
    used: { type: Boolean, default: false },
    usedBy: { type: Number },
    usedAt: { type: Date },
    expiresAt: { type: Date },
    createdBy: { type: Number, required: true },
  },
  { timestamps: true }
);

RedeemCodeSchema.pre("save", function (next) {
  if (this.isNew) {
    this.durationDays = parseDuration(this.duration);
  }
  next();
});

export const RedeemCode = mongoose.model<IRedeemCode>(
  "RedeemCode",
  RedeemCodeSchema
);
export { parseDuration };
