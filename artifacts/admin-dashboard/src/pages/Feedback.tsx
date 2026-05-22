import { useState, useEffect, useCallback } from "react";
import { api, type FeedbackEntry } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  all: "All",
  feedback: "Feedback",
  appeal: "Appeals",
};

export default function Feedback() {
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "feedback" | "appeal">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFeedback({ type: filter === "all" ? undefined : filter, limit: 100 });
      setItems(res.items);
      setUnread(res.unread);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (id: string) => {
    setMarkingRead(id);
    try {
      await api.markFeedbackRead(id);
      setItems(prev => prev.map(f => f._id === id ? { ...f, read: true } : f));
      setUnread(prev => Math.max(0, prev - 1));
    } catch {}
    setMarkingRead(null);
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const pill = (type: "feedback" | "appeal") =>
    type === "appeal"
      ? { bg: "rgba(239,68,68,0.15)", color: "#f87171", label: "🔴 Appeal" }
      : { bg: "rgba(99,102,241,0.15)", color: "#a5b4fc", label: "💬 Feedback" };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Feedback Inbox</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        {(["all", "feedback", "appeal"] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className="px-3 py-1.5 rounded-lg text-sm transition-all"
            style={filter === t
              ? { background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.2))", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }
              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }
            }
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl p-4 mb-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-3xl mb-3">📨</div>
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            No {filter === "all" ? "feedback" : TYPE_LABELS[filter].toLowerCase()} yet.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const p = pill(item.type);
            const isExpanded = expanded === item._id;
            return (
              <div
                key={item._id}
                className="rounded-xl overflow-hidden transition-all"
                style={{
                  background: item.read ? "rgba(255,255,255,0.02)" : "rgba(99,102,241,0.06)",
                  border: item.read ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(99,102,241,0.2)",
                }}
              >
                <button
                  className="w-full text-left p-4 flex items-start gap-3"
                  onClick={() => setExpanded(isExpanded ? null : item._id)}
                >
                  <span
                    className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                    style={{ background: p.bg, color: p.color }}
                  >
                    {p.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {item.username ? `@${item.username}` : item.firstName || `ID ${item.userId}`}
                      </span>
                      {!item.read && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#6366f1" }} />
                      )}
                      <span className="text-xs ml-auto flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <p
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.6)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: isExpanded ? undefined : 2, WebkitBoxOrient: "vertical" as const }}
                    >
                      {item.message}
                    </p>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 flex items-center gap-3">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                      User ID: {item.userId}
                    </span>
                    {!item.read && (
                      <button
                        onClick={() => handleMarkRead(item._id)}
                        disabled={markingRead === item._id}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)", opacity: markingRead === item._id ? 0.5 : 1 }}
                      >
                        {markingRead === item._id ? "Marking…" : "Mark as Read"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
