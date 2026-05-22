const getApiKey = (): string | null => localStorage.getItem("nova_api_key");

export const isAuthenticated = (): boolean => !!getApiKey();

export const saveCredentials = (apiKey: string): void => {
  localStorage.setItem("nova_api_key", apiKey);
};

export const clearCredentials = (): void => {
  localStorage.removeItem("nova_api_key");
};

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Not authenticated");

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": apiKey,
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
  bot: { status: string; username?: string; first_name?: string; id?: number };
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
  usage: { messages: number; images: number; builds: number; music: number };
  settings: { style: string; emoji: boolean; length: string; language: string };
  warnings: number;
  groups: number[];
}

export interface UsersResponse { users: User[]; total: number; page: number; pages: number }

export interface Code { _id: string; code: string; duration: string; used: boolean; usedBy?: number; createdAt: string }

export interface LogEntry { _id: string; event: string; userId?: number; chatId?: number; meta?: Record<string, unknown>; ts: string }

export interface FeedbackEntry {
  _id: string;
  userId: number;
  username?: string;
  firstName?: string;
  message: string;
  type: "feedback" | "appeal";
  read: boolean;
  createdAt: string;
}

export interface AnalyticsData {
  summary: { results: Array<{ _id: { event: string; day: string }; count: number }> };
  topCommands: Array<{ _id: string; count: number }>;
}

export interface BotConfigData {
  activeChatModel: string;
  activeImageModel: string;
  chatModels: Array<{ id: string; name: string; active: boolean }>;
  imageModels: Array<{ id: string; name: string; active: boolean }>;
  premiumEmojiEnabled: boolean;
  maintenanceMode: boolean;
  usageLimits: {
    freeMessages: number; freeImages: number; freeBuilds: number; freeMusic: number;
    premiumMessages: number; premiumImages: number; premiumBuilds: number; premiumMusic: number;
    resetIntervalHours: number;
  };
  welcomeMessage: string;
  botPersonality: string;
}

export interface GroupData {
  _id: string;
  chatId: number;
  title?: string;
  aiEnabled: boolean;
  antilink: boolean;
  antiflood: boolean;
  captchaEnabled: boolean;
  locked: boolean;
  warnLimit: number;
  memberCount?: number;
}

export const api = {
  getStats: (): Promise<BotStats> => apiFetch("/api/admin/stats"),

  getUsers: (params: { page?: number; limit?: number; search?: string; premium?: boolean; banned?: boolean }): Promise<UsersResponse> => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    if (params.premium) q.set("premium", "true");
    if (params.banned) q.set("banned", "true");
    return apiFetch(`/api/admin/users?${q}`);
  },

  getUser: (userId: number): Promise<{ user: User; memoryCount: number }> => apiFetch(`/api/admin/users/${userId}`),
  banUser: (userId: number): Promise<void> => apiFetch(`/api/admin/users/${userId}/ban`, { method: "POST" }),
  unbanUser: (userId: number): Promise<void> => apiFetch(`/api/admin/users/${userId}/unban`, { method: "POST" }),
  setPremium: (userId: number, active: boolean, days?: number): Promise<void> =>
    apiFetch(`/api/admin/users/${userId}/premium`, { method: "POST", body: JSON.stringify({ active, days }) }),
  clearMemory: (userId: number): Promise<void> => apiFetch(`/api/admin/users/${userId}/memory`, { method: "DELETE" }),
  deleteUser: (userId: number): Promise<void> => apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
  messageUser: (userId: number, message: string): Promise<void> =>
    apiFetch(`/api/admin/users/${userId}/message`, { method: "POST", body: JSON.stringify({ message }) }),

  broadcast: (message: string, premiumOnly?: boolean): Promise<{ sent: number; failed: number; total: number }> =>
    apiFetch("/api/admin/broadcast", { method: "POST", body: JSON.stringify({ message, premiumOnly }) }),

  getCodes: (): Promise<{ codes: Code[] }> => apiFetch("/api/admin/codes"),
  createCode: (code: string, duration: string): Promise<void> =>
    apiFetch("/api/admin/codes", { method: "POST", body: JSON.stringify({ code, duration }) }),
  deleteCode: (id: string): Promise<void> => apiFetch(`/api/admin/codes/${id}`, { method: "DELETE" }),
  generateCodes: (count: number, duration: string): Promise<{ codes: Code[] }> =>
    apiFetch("/api/admin/codes/generate", { method: "POST", body: JSON.stringify({ count, duration }) }),

  getAnalytics: (days?: number): Promise<AnalyticsData> => apiFetch(`/api/admin/analytics?days=${days ?? 7}`),

  getLogs: (limit?: number, event?: string): Promise<{ logs: LogEntry[] }> => {
    const q = new URLSearchParams();
    if (limit) q.set("limit", String(limit));
    if (event) q.set("event", event);
    return apiFetch(`/api/admin/logs?${q}`);
  },

  getBotConfig: (): Promise<BotConfigData> => apiFetch("/api/admin/config"),
  updateBotConfig: (data: Partial<BotConfigData>): Promise<BotConfigData> =>
    apiFetch("/api/admin/config", { method: "PATCH", body: JSON.stringify(data) }),
  updateLimits: (limits: BotConfigData["usageLimits"]): Promise<void> =>
    apiFetch("/api/admin/config/limits", { method: "PUT", body: JSON.stringify(limits) }),

  getGroups: (params?: { page?: number; limit?: number }): Promise<{ groups: GroupData[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    return apiFetch(`/api/admin/groups?${q}`);
  },
  deleteGroup: (chatId: number): Promise<void> => apiFetch(`/api/admin/groups/${chatId}`, { method: "DELETE" }),

  setMaintenance: (enabled: boolean): Promise<void> =>
    apiFetch("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ enabled }) }),
  togglePremiumEmoji: (enabled: boolean): Promise<void> =>
    apiFetch("/api/admin/premium-emoji", { method: "POST", body: JSON.stringify({ enabled }) }),

  getFeedback: (params?: { type?: string; limit?: number }): Promise<{ items: FeedbackEntry[]; unread: number }> => {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.limit) q.set("limit", String(params.limit));
    return apiFetch(`/api/admin/feedback?${q}`);
  },
  markFeedbackRead: (id: string): Promise<void> =>
    apiFetch(`/api/admin/feedback/${id}/read`, { method: "PATCH" }),

  testChatModel: (model: string): Promise<{ ok: boolean; reply?: string; error?: string; latencyMs: number }> =>
    apiFetch("/api/admin/test/chat", { method: "POST", body: JSON.stringify({ model }) }),

  testImageModel: (model: string): Promise<{ ok: boolean; source?: string; bytes?: number; error?: string; latencyMs: number }> =>
    apiFetch("/api/admin/test/image", { method: "POST", body: JSON.stringify({ model }) }),
};
