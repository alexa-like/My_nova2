import mongoose from "mongoose";
import { logger } from "../../lib/logger.js";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  mongoose.connection.on("disconnected", () =>
    logger.warn("MongoDB disconnected — auto-reconnect in progress")
  );
  mongoose.connection.on("reconnected", () =>
    logger.info("MongoDB reconnected")
  );
  mongoose.connection.on("error", (err) =>
    logger.error({ err }, "MongoDB connection error")
  );

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS:          45000,
    connectTimeoutMS:         10000,
    heartbeatFrequencyMS:     10000,
    maxPoolSize:              10,
    minPoolSize:              1,
    retryWrites:              true,
    retryReads:               true,
  });

  connected = true;
  logger.info("MongoDB connected");
}

export async function disconnectDB(): Promise<void> {
  if (!connected) return;
  try {
    await mongoose.connection.close();
    connected = false;
    logger.info("MongoDB disconnected cleanly");
  } catch (err) {
    logger.warn({ err }, "Error closing MongoDB connection");
  }
}
