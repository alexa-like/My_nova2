import { useEffect, useState } from "react";
import { api, type AnalyticsData } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { RefreshCw } from "lucide-react";

const EVENT_COLORS: Record<string, string> = {
  message: "#6366f1",
  command: "#22d3ee",
  image_gen: "#a855f7",
  error: "#ef4444",
  new_user: "#22c55e",
  inline_query: "#f59e0b",
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAnalytics(days);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  const chartData = (() => {
    if (!data) return [];
    const byDay: Record<string, Record<string, number>> = {};
    for (const row of data.summary.results) {
      const { day, event } = row._id;
      if (!byDay[day]) byDay[day] = { day };
      byDay[day][event] = row.count;
    }
    return Object.values(byDay).sort((a, b) => (a.day as string).localeCompare(b.day as string));
  })();

  const allEvents = data
    ? [...new Set(data.summary.results.map((r) => r._id.event))]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Event activity over time</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === d ? "bg-indigo-600 text-white" : "bg-gray-900 text-gray-400 hover:text-white"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button onClick={load} className="text-gray-500 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Daily Events</h3>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
        ) : chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No data yet. Events will appear once the bot receives messages.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
              {allEvents.map((event) => (
                <Bar key={event} dataKey={event} fill={EVENT_COLORS[event] || "#6b7280"} stackId="a" radius={[0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {data && data.topCommands.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Top Commands</h3>
          <div className="space-y-2">
            {data.topCommands.map((cmd, i) => {
              const max = data.topCommands[0]?.count || 1;
              const pct = Math.round((cmd.count / max) * 100);
              return (
                <div key={cmd._id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-4">{i + 1}</span>
                  <span className="font-mono text-sm text-gray-300 w-28 truncate">{cmd._id}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div
                      className="bg-indigo-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{cmd.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
