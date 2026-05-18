import { useEffect, useState } from "react";
import { api, type LogEntry } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const EVENT_BADGES: Record<string, string> = {
  message: "bg-indigo-900/50 text-indigo-300 border-indigo-800",
  command: "bg-cyan-900/50 text-cyan-300 border-cyan-800",
  image_gen: "bg-purple-900/50 text-purple-300 border-purple-800",
  image_edit: "bg-purple-900/50 text-purple-300 border-purple-800",
  error: "bg-red-900/50 text-red-300 border-red-800",
  new_user: "bg-green-900/50 text-green-300 border-green-800",
  inline_query: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  ban: "bg-red-900/50 text-red-300 border-red-800",
  warn: "bg-orange-900/50 text-orange-300 border-orange-800",
  mute: "bg-orange-900/50 text-orange-300 border-orange-800",
  premium_redeemed: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
};

const EVENTS = ["", "message", "command", "image_gen", "error", "new_user", "ban", "warn", "mute", "inline_query"];

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [limit, setLimit] = useState(50);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getLogs(limit, eventFilter || undefined);
      setLogs(res.logs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [eventFilter, limit]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Activity Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time event stream</p>
        </div>
        <button onClick={load} className="text-gray-500 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-500">Filter:</span>
        {EVENTS.map((ev) => (
          <button
            key={ev || "all"}
            onClick={() => setEventFilter(ev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              eventFilter === ev
                ? "bg-indigo-600 text-white"
                : "bg-gray-900 text-gray-400 border border-gray-800 hover:text-white"
            }`}
          >
            {ev || "all"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-500">Limit:</span>
          {[25, 50, 100, 200].map((l) => (
            <button
              key={l}
              onClick={() => setLimit(l)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                limit === l ? "text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="divide-y divide-gray-800/50">
          {loading ? (
            <div className="text-center py-10 text-gray-500 text-sm">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">No events logged yet</div>
          ) : logs.map((log) => (
            <div key={log._id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-800/30 transition-colors">
              <span className={`px-1.5 py-0.5 rounded border text-xs font-medium flex-shrink-0 mt-0.5 ${EVENT_BADGES[log.event] || "bg-gray-800 text-gray-400 border-gray-700"}`}>
                {log.event}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {log.userId && (
                    <span className="text-xs text-gray-400 font-mono">uid:{log.userId}</span>
                  )}
                  {log.meta && Object.keys(log.meta).length > 0 && (
                    <span className="text-xs text-gray-500 truncate">
                      {Object.entries(log.meta).map(([k, v]) => `${k}:${v}`).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(log.ts)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
