import { useEffect, useState } from "react";
import { api, type BotStats } from "@/lib/api";
import { Users, Crown, Ban, Activity, Image, MessageSquare, AlertCircle, Zap, RefreshCw, Server, Database, Key } from "lucide-react";

function StatCard({
  label, value, icon: Icon, gradient, sub, pulse
}: {
  label: string; value: string | number; icon: React.ElementType;
  gradient: string; sub?: string; pulse?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex items-start justify-between group transition-transform hover:-translate-y-0.5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
        <p className="text-2xl font-bold text-white mt-1 tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>}
      </div>
      <div className="rounded-xl p-2.5 flex-shrink-0 ml-3" style={{ background: gradient, opacity: 0.85 }}>
        <Icon size={18} className="text-white" />
      </div>
      {pulse && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
    </div>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</h3>
      <p className="text-3xl font-bold text-white tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showRefresh = false) => {
    try {
      setError("");
      if (showRefresh) setRefreshing(true);
      const data = await api.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!stats) return null;
  const isOnline = stats.bot.status === "online";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Real-time bot overview</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-2 rounded-xl transition-colors"
            style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={
              isOnline
                ? { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }
                : { background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }
            }
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {isOnline ? `@${stats.bot.username || "bot"} Online` : "Bot Offline"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.users.total} icon={Users} gradient="linear-gradient(135deg,#6366f1,#4f46e5)" />
        <StatCard label="Premium" value={stats.users.premium} icon={Crown} gradient="linear-gradient(135deg,#f59e0b,#d97706)" />
        <StatCard label="Active Today" value={stats.users.activeToday} icon={Activity} gradient="linear-gradient(135deg,#22c55e,#16a34a)" />
        <StatCard label="Banned" value={stats.users.banned} icon={Ban} gradient="linear-gradient(135deg,#ef4444,#dc2626)" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Images Generated" value={stats.analytics.imageGens} icon={Image} gradient="linear-gradient(135deg,#a855f7,#9333ea)" />
        <StatCard label="Messages Tracked" value={stats.analytics.messagesTotal} icon={MessageSquare} gradient="linear-gradient(135deg,#3b82f6,#2563eb)" />
        <StatCard label="Active (1 hr)" value={stats.analytics.activeUsersHour} icon={Zap} gradient="linear-gradient(135deg,#06b6d4,#0891b2)" />
        <StatCard label="Errors" value={stats.analytics.errorsTotal} icon={AlertCircle} gradient="linear-gradient(135deg,#f97316,#ea580c)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <InfoCard label="Groups" value={stats.groups} sub="Active group chats" />
        <InfoCard
          label="Redeem Codes"
          value={`${stats.codes.used} / ${stats.codes.total}`}
          sub="Used / Total codes"
        />
        <InfoCard label="Memory Entries" value={stats.memory} sub="Conversation threads stored" />
      </div>

      {isOnline && stats.bot.first_name && (
        <div
          className="rounded-2xl p-4 flex items-center gap-4"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}
          >
            <Server size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{stats.bot.first_name}</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              ID: {stats.bot.id} · @{stats.bot.username}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Polling active</span>
          </div>
        </div>
      )}
    </div>
  );
}
