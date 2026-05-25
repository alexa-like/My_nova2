import mongoose, { Document, Schema } from "mongoose";

export interface IPromoGroup extends Document {
  title: string;
  link: string;
  username?: string;
  reward: number;
  active: boolean;
  addedBy: number;
  verifiedUsers: number[];
  createdAt: Date;
  updatedAt: Date;
}

const PromoGroupSchema = new Schema<IPromoGroup>(
  {
    title:         { type: String, required: true },
    link:          { type: String, required: true },
    username:      { type: String },
    reward:        { type: Number, required: true, min: 1 },
    active:        { type: Boolean, default: true },
    addedBy:       { type: Number, required: true },
    verifiedUsers: { type: [Number], default: [] },
  },
  { timestamps: true }
);

PromoGroupSchema.index({ active: 1 });
PromoGroupSchema.index({ addedBy: 1 });

export const PromoGroup = mongoose.model<IPromoGroup>("PromoGroup", PromoGroupSchema);
