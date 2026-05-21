import type { GeneratedProject } from "../services/projectGenerator.js";

export interface CachedBuild {
  project: GeneratedProject;
  prompt: string;
  savedAt: number;
}

const cache = new Map<number, CachedBuild>();
const TTL_MS = 45 * 60 * 1000; // 45 minutes

export function cacheUserBuild(userId: number, project: GeneratedProject, prompt: string): void {
  cache.set(userId, { project, prompt, savedAt: Date.now() });
}

export function getCachedBuild(userId: number): CachedBuild | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry;
}

export function clearUserBuild(userId: number): void {
  cache.delete(userId);
}
