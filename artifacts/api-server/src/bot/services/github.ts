import axios from "axios";
import { logger } from "../../lib/logger.js";

const GITHUB_API = "https://api.github.com";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Nova-AI-Bot/2.0",
    "Content-Type": "application/json",
  };
}

export interface RepoInfo {
  name: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
}

export interface GitHubFile {
  path: string;
  content: string;
}

// ── Repo management ────────────────────────────────────────────────────────────

export async function createGitHubRepo(
  token: string,
  repoName: string,
  description: string,
  isPrivate = false
): Promise<RepoInfo> {
  const resp = await axios.post(
    `${GITHUB_API}/user/repos`,
    {
      name: repoName,
      description: description.substring(0, 255),
      private: isPrivate,
      auto_init: false,
      has_issues: true,
      has_wiki: false,
    },
    { headers: headers(token), timeout: 20000 }
  );
  return {
    name: resp.data.name,
    htmlUrl: resp.data.html_url,
    cloneUrl: resp.data.clone_url,
    defaultBranch: resp.data.default_branch || "main",
  };
}

export async function repoExists(
  token: string,
  username: string,
  repoName: string
): Promise<boolean> {
  try {
    await axios.get(`${GITHUB_API}/repos/${username}/${repoName}`, {
      headers: headers(token),
      timeout: 10000,
    });
    return true;
  } catch (err: any) {
    if (err?.response?.status === 404) return false;
    throw err;
  }
}

// ── File pushing ───────────────────────────────────────────────────────────────

export async function pushFile(
  token: string,
  username: string,
  repoName: string,
  filePath: string,
  content: string,
  message = "Initial AI generated project ✨"
): Promise<void> {
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  await axios.put(
    `${GITHUB_API}/repos/${username}/${repoName}/contents/${filePath}`,
    { message, content: encoded },
    { headers: headers(token), timeout: 25000 }
  );
}

export async function pushAllFiles(
  token: string,
  username: string,
  repoName: string,
  files: GitHubFile[],
  onProgress?: (done: number, total: number) => Promise<void>
): Promise<{ pushed: number; failed: number }> {
  const BATCH_SIZE = 3;
  let done = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((f) => pushFile(token, username, repoName, f.path, f.content))
    );
    for (const r of results) {
      if (r.status === "rejected") {
        failed++;
        // Import logger lazily to avoid circular import
        logger.warn({ reason: r.reason?.message ?? String(r.reason) }, "Failed to push file to GitHub");
      }
    }
    done = Math.min(i + BATCH_SIZE, files.length);
    if (onProgress) await onProgress(done - failed, files.length);
    if (i + BATCH_SIZE < files.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return { pushed: done - failed, failed };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function sanitizeRepoName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
  return base || `nova-project-${Date.now().toString(36)}`;
}

export function uniqueRepoName(base: string): string {
  const suffix = Date.now().toString(36).slice(-5);
  const clean = sanitizeRepoName(base);
  const truncated = clean.substring(0, 44);
  return `${truncated}-${suffix}`;
}
