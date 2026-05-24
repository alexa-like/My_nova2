import { BuildCacheModel } from "../models/BuildCache.js";
import type { GeneratedProject } from "../services/projectGenerator.js";
import { logger } from "../../lib/logger.js";

export interface CachedBuild {
  project: GeneratedProject;
  prompt: string;
  savedAt: number;
  repoUrl?: string;
}

export async function cacheUserBuild(
  userId: number,
  project: GeneratedProject,
  prompt: string,
  repoUrl?: string
): Promise<void> {
  try {
    await BuildCacheModel.findOneAndUpdate(
      { userId },
      { userId, project, prompt, repoUrl, savedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.warn({ err, userId }, "Failed to cache build in MongoDB — non-fatal");
  }
}

export async function getCachedBuild(userId: number): Promise<CachedBuild | null> {
  try {
    const doc = await BuildCacheModel.findOne({ userId });
    if (!doc) return null;
    return {
      project: doc.project as GeneratedProject,
      prompt: doc.prompt,
      savedAt: doc.savedAt.getTime(),
      repoUrl: doc.repoUrl,
    };
  } catch (err) {
    logger.warn({ err, userId }, "Failed to retrieve cached build — non-fatal");
    return null;
  }
}

export async function clearUserBuild(userId: number): Promise<void> {
  try {
    await BuildCacheModel.deleteOne({ userId });
  } catch (err) {
    logger.warn({ err, userId }, "Failed to clear cached build — non-fatal");
  }
}
