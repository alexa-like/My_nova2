import mongoose, { Document, Schema } from "mongoose";

export interface IBuildCache extends Document {
  userId: number;
  project: object;
  prompt: string;
  repoUrl?: string;
  vercelUrl?: string;
  renderUrl?: string;
  savedAt: Date;
}

const BuildCacheSchema = new Schema<IBuildCache>({
  userId:    { type: Number, required: true, unique: true, index: true },
  project:   { type: Schema.Types.Mixed, required: true },
  prompt:    { type: String, default: "" },
  repoUrl:   { type: String },
  vercelUrl: { type: String },
  renderUrl: { type: String },
  savedAt:   { type: Date, default: Date.now },
});

BuildCacheSchema.index({ savedAt: 1 }, { expireAfterSeconds: 2700 });

export const BuildCacheModel = mongoose.model<IBuildCache>("BuildCache", BuildCacheSchema);
