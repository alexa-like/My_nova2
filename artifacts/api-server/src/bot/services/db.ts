import mongoose from "mongoose";
import { logger } from "../../lib/logger.js";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  connected = true;
  logger.info("MongoDB connected");
}
