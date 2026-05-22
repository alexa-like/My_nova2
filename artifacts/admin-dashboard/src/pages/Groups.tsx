import { useEffect, useState } from "react";
import { api, type GroupData } from "@/lib/api";
import { RefreshCw, Trash2, Globe, Shield, Bot, Zap } from "lucide-react";

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-medium"
      style={
        on
          ? { background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }
          : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.08)" }
      }
    >
      {label}
    </span>
  );
}

export default function Groups() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getGroups({ page, limit: 20 });
      setGroups(res.groups);
      setTotal(res.total);
      setPages(Math.ceil(res.total / 20));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const handleDelete = async (chatId: number, title?: string) => {
    if (!confirm(`Remove "${title || chatId}" from database?`)) return;
    setDeleting(chatId);
    try {
      await api.deleteGroup(chatId);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Groups</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{total} groups registered</p>
        </div>
        <button onClick={() => load()} style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white transition-colors">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Group", "Chat ID", "Features", "Warn Limit", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.02)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Loading...
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
                  No groups yet. Add the bot to a Telegram group to get started.
                </td>
              </tr>
            ) : groups.map((g) => (
              <tr
                key={g._id}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                className="transition-colors"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,0.15)" }}>
                      <Globe size={13} style={{ color: "#a5b4fc" }} />
                    </div>
                    <span className="text-white font-medium truncate max-w-[160px]">{g.title || "Unnamed Group"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {g.chatId}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge on={g.aiEnabled} label="AI" />
                    <Badge on={g.antilink} label="AntiLink" />
                    <Badge on={g.antiflood} label="AntiFlood" />
                    <Badge on={g.captchaEnabled} label="Captcha" />
                    <Badge on={g.locked} label="Locked" />
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {g.warnLimit ?? 3}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(g.chatId, g.title)}
                    disabled={deleting === g.chatId}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#f87171"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Previous
          </button>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
