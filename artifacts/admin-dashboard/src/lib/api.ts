const getConfig = (): { baseUrl: string; apiKey: string } | null => {
  const baseUrl = localStorage.getItem("nova_base_url");
  const apiKey = localStorage.getItem("nova_api_key");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
};

export const isAuthenticated = (): boolean => !!getConfig();

export const saveCredentials = (baseUrl: string, apiKey: string): void => {
  localStorage.setItem("nova_base_url", baseUrl.replace(/\/$/, ""));
  localStorage.setItem("nova_api_key", apiKey);
};

export const clearCredentials = (): void => {
  localStorage.removeItem("nova_base_url");
  localStorage.removeItem("nova_api_key");
};

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Not authenticated");

  const res = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": config.apiKey,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface BotStats {
  bot: { status: string; username?: string; first_name?: string };
  users: { total: number; premium: number; banned: number; activeToday: number };
  groups: number;
  memory: number;
  codes: { total: number; used: number };
  analytics: { imageGens: number; messagesTotal: number; errorsTotal: number; activeUsersHour: number };
}

export interface User {
  _id: string;
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastSeen: string;
  firstSeen: string;
  banned: boolean;
  isOwner: boolean;
  premium: { active: boolean; expiresAt?: string; plan?: string };
  usage: { messages: number; images: number };
  settings: { style: string; emoji: boolean; length: string; language: string };
  warnings: number;
}

export interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pages: number;
}

export interface Code {
  _id: string;
  code: string;
  duration: string;
  used: boolean;
  usedBy?: number;
  createdAt: string;
}

export interface LogEntry {
  _id: string;
  event: string;
  userId?: number;
  chatId?: number;
  meta?: Record<string, unknown>;
  ts: string;
}

export interface AnalyticsData {
  summary: { results: Array<{ _id: { event: string; day: string }; count: number }> };
  topCommands: Array<{ _id: string; count: number }>;
}

export const api = {
  getStats: (): Promise<BotStats> => apiFetch("/api/admin/stats"),

  getUsers: (params: {
    page?: number;
    limit?: number;
    search?: string;
    premium?: boolean;
    banned?: boolean;
  }): Promise<UsersResponse> => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    if (params.premium) q.set("premium", "true");
    if (params.banned) q.set("banned", "true");
    return apiFetch(`/api/admin/users?${q}`);
  },

  getUser: (userId: number): Promise<{ user: User; memoryCount: number }> =>
    apiFetch(`/api/admin/users/${userId}`),

  banUser: (userId: number): Promise<void> =>
    apiFetch(`/api/admin/users/${userId}/ban`, { method: "POST" }),

  unbanUser: (userId: number): Promise<void> =>
    apiFetch(`/api/admin/users/${userId}/unban`, { method: "POST" }),

  setPremium: (userId: number, active: boolean, days?: number): Promise<void> =>
    apiFetch(`/api/admin/users/${userId}/premium`, {
      method: "POST",
      body: JSON.stringify({ active, days }),
    }),

  clearMemory: (userId: number): Promise<void> =>
    apiFetch(`/api/admin/users/${userId}/memory`, { method: "DELETE" }),

  broadcast: (message: string, premiumOnly?: boolean): Promise<{ sent: number; failed: number; total: number }> =>
    apiFetch("/api/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message, premiumOnly }),
    }),

  getCodes: (): Promise<{ codes: Code[] }> => apiFetch("/api/admin/codes"),

  createCode: (code: string, duration: string): Promise<void> =>
    apiFetch("/api/admin/codes", {
      method: "POST",
      body: JSON.stringify({ code, duration }),
    }),

  getAnalytics: (days?: number): Promise<AnalyticsData> =>
    apiFetch(`/api/admin/analytics?days=${days ?? 7}`),

  getLogs: (limit?: number, event?: string): Promise<{ logs: LogEntry[] }> => {
    const q = new URLSearchParams();
    if (limit) q.set("limit", String(limit));
    if (event) q.set("event", event);
    return apiFetch(`/api/admin/logs?${q}`);
  },
};
