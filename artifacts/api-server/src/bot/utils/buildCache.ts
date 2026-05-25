import { BuildCacheModel } from "../models/BuildCache.js";
import type { GeneratedProject } from "../services/projectGenerator.js";
import { logger } from "../../lib/logger.js";

export interface CachedBuild {
  project: GeneratedProject;
  prompt: string;
  savedAt: number;
  repoUrl?: string;
  vercelUrl?: string;
  renderUrl?: string;
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
      { userId, project, prompt, repoUrl, vercelUrl: undefined, renderUrl: undefined, savedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.warn({ err, userId }, "Failed to cache build in MongoDB — non-fatal");
  }
}

export async function updateBuildDeployUrls(
  userId: number,
  urls: { vercelUrl?: string; renderUrl?: string }
): Promise<void> {
  try {
    const update: Record<string, string> = {};
    if (urls.vercelUrl) update.vercelUrl = urls.vercelUrl;
    if (urls.renderUrl) update.renderUrl = urls.renderUrl;
    await BuildCacheModel.findOneAndUpdate({ userId }, { $set: update });
  } catch (err) {
    logger.warn({ err, userId }, "Failed to update deploy URLs in cache — non-fatal");
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
      vercelUrl: (doc as any).vercelUrl,
      renderUrl: (doc as any).renderUrl,
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
