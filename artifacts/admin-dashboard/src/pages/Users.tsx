import { useEffect, useState, useCallback } from "react";
import { api, type User } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Search, Crown, Ban, Trash2, RefreshCw, X } from "lucide-react";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filterPremium, setFilterPremium] = useState(false);
  const [filterBanned, setFilterBanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Premium-days inline modal
  const [premiumTarget, setPremiumTarget] = useState<User | null>(null);
  const [premiumDays, setPremiumDays] = useState("30");

  const showMsg = (type: "success" | "error", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getUsers({
        page,
        limit: 20,
        search: search || undefined,
        premium: filterPremium || undefined,
        banned: filterBanned || undefined,
      });
      setUsers(res.users);
      setTotal(res.total);
      setPages(res.pages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterPremium, filterBanned]);

  useEffect(() => { load(); }, [load]);

  const handleBan = async (user: User) => {
    setActionLoading(user.userId);
    try {
      if (user.banned) await api.unbanUser(user.userId);
      else await api.banUser(user.userId);
      showMsg("success", user.banned ? `Unbanned ${user.firstName || user.userId}` : `Banned ${user.firstName || user.userId}`);
      await load();
    } catch (err: any) {
      showMsg("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePremiumOpen = (user: User) => {
    if (user.premium.active) {
      handleRevokePremium(user);
    } else {
      setPremiumDays("30");
      setPremiumTarget(user);
    }
  };

  const handleRevokePremium = async (user: User) => {
    setActionLoading(user.userId);
    try {
      await api.setPremium(user.userId, false);
      showMsg("success", `Premium revoked for ${user.firstName || user.userId}`);
      await load();
    } catch (err: any) {
      showMsg("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGrantPremium = async () => {
    if (!premiumTarget) return;
    const days = Number(premiumDays);
    setActionLoading(premiumTarget.userId);
    setPremiumTarget(null);
    try {
      await api.setPremium(premiumTarget.userId, true, days === 0 ? undefined : days);
      showMsg("success", `Premium granted to ${premiumTarget.firstName || premiumTarget.userId}${days === 0 ? " (lifetime)" : ` for ${days} days`}`);
      await load();
    } catch (err: any) {
      showMsg("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearMemory = async (user: User) => {
    if (!confirm(`Clear all conversation memory for @${user.username || user.userId}?`)) return;
    setActionLoading(user.userId);
    try {
      await api.clearMemory(user.userId);
      showMsg("success", "Memory cleared.");
    } catch (err: any) {
      showMsg("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Premium days modal */}
      {premiumTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Grant Premium</h3>
              <button onClick={() => setPremiumTarget(null)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Granting premium to <span className="text-white font-medium">{premiumTarget.firstName || premiumTarget.userId}</span>
            </p>
            <div>
              <p className="text-xs text-gray-500 mb-2">Days (0 = lifetime)</p>
              <input
                type="number"
                min={0}
                value={premiumDays}
                onChange={(e) => setPremiumDays(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleGrantPremium(); if (e.key === "Escape") setPremiumTarget(null); }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPremiumTarget(null)} className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleGrantPremium}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Grant
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} total</p>
        </div>
        <button onClick={load} className="text-gray-500 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by ID, username..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          onClick={() => { setFilterPremium(!filterPremium); setPage(1); }}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterPremium ? "bg-yellow-600 text-white" : "bg-gray-900 text-gray-400 border border-gray-800 hover:text-white"}`}
        >
          Premium
        </button>
        <button
          onClick={() => { setFilterBanned(!filterBanned); setPage(1); }}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterBanned ? "bg-red-700 text-white" : "bg-gray-900 text-gray-400 border border-gray-800 hover:text-white"}`}
        >
          Banned
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {actionMsg && (
        <div className={`rounded-xl p-3 text-sm flex items-center justify-between ${
          actionMsg.type === "success"
            ? "bg-green-950 border border-green-800 text-green-400"
            : "bg-red-950 border border-red-800 text-red-400"
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="ml-3 opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Last Seen</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Usage</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-500">Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-500">No users found</td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.userId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">
                    {user.firstName || "—"}
                    {user.isOwner && <span className="ml-1 text-xs text-indigo-400">[owner]</span>}
                  </div>
                  {user.username && (
                    <div className="text-xs text-gray-500">@{user.username}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{user.userId}</td>
                <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{timeAgo(user.lastSeen)}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex gap-1.5 flex-wrap">
                    {user.premium.active && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-400 border border-yellow-800">Premium</span>
                    )}
                    {user.banned && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 border border-red-800">Banned</span>
                    )}
                    {user.warnings > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-orange-900/50 text-orange-400 border border-orange-800">{user.warnings}w</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                  {user.usage.messages}msg / {user.usage.images}img
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handlePremiumOpen(user)}
                      disabled={actionLoading === user.userId || user.isOwner}
                      title={user.premium.active ? "Remove premium" : "Grant premium"}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        user.premium.active
                          ? "text-yellow-400 hover:bg-yellow-900/30"
                          : "text-gray-500 hover:text-yellow-400 hover:bg-yellow-900/20"
                      }`}
                    >
                      <Crown size={14} />
                    </button>
                    <button
                      onClick={() => handleBan(user)}
                      disabled={actionLoading === user.userId || user.isOwner}
                      title={user.banned ? "Unban" : "Ban"}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        user.banned
                          ? "text-red-400 hover:bg-red-900/30"
                          : "text-gray-500 hover:text-red-400 hover:bg-red-900/20"
                      }`}
                    >
                      <Ban size={14} />
                    </button>
                    <button
                      onClick={() => handleClearMemory(user)}
                      disabled={actionLoading === user.userId}
                      title="Clear memory"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-orange-400 hover:bg-orange-900/20 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-40 transition-colors text-xs"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(pages, page + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-40 transition-colors text-xs"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
