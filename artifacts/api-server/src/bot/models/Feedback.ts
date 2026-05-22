import mongoose, { Document, Schema } from "mongoose";

export interface IFeedback extends Document {
  userId: number;
  username?: string;
  firstName?: string;
  message: string;
  type: "feedback" | "appeal";
  read: boolean;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>({
  userId:    { type: Number, required: true, index: true },
  username:  { type: String },
  firstName: { type: String },
  message:   { type: String, required: true },
  type:      { type: String, enum: ["feedback", "appeal"], default: "feedback", index: true },
  read:      { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const Feedback = mongoose.model<IFeedback>("Feedback", FeedbackSchema);
