import { useEffect, useState } from "react";
import { api, type BotStats } from "@/lib/api";
import { Users, Crown, Ban, Activity, Image, MessageSquare, AlertCircle, Zap } from "lucide-react";

function StatCard({
  label, value, icon: Icon, color, sub
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const data = await api.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400">
          Error: {error}
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
          <p className="text-sm text-gray-500 mt-0.5">Real-time bot overview</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
          isOnline ? "bg-green-950 text-green-400 border border-green-900" : "bg-red-950 text-red-400 border border-red-900"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-green-400" : "bg-red-400"} animate-pulse`} />
          {isOnline ? `@${stats.bot.username} Online` : "Bot Offline"}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.users.total} icon={Users} color="bg-indigo-600/20 text-indigo-400" />
        <StatCard label="Premium" value={stats.users.premium} icon={Crown} color="bg-yellow-600/20 text-yellow-400" />
        <StatCard label="Active Today" value={stats.users.activeToday} icon={Activity} color="bg-green-600/20 text-green-400" />
        <StatCard label="Banned" value={stats.users.banned} icon={Ban} color="bg-red-600/20 text-red-400" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Images Generated" value={stats.analytics.imageGens} icon={Image} color="bg-purple-600/20 text-purple-400" />
        <StatCard label="Messages Tracked" value={stats.analytics.messagesTotal} icon={MessageSquare} color="bg-blue-600/20 text-blue-400" />
        <StatCard label="Active (1h)" value={stats.analytics.activeUsersHour} icon={Zap} color="bg-cyan-600/20 text-cyan-400" />
        <StatCard label="Errors Logged" value={stats.analytics.errorsTotal} icon={AlertCircle} color="bg-orange-600/20 text-orange-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Groups</h3>
          <p className="text-3xl font-bold text-white">{stats.groups.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Active group chats</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Memory Entries</h3>
          <p className="text-3xl font-bold text-white">{stats.memory.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Conversation threads stored</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Redeem Codes</h3>
          <p className="text-3xl font-bold text-white">
            {stats.codes.used}
            <span className="text-lg text-gray-500"> / {stats.codes.total}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">Used / Total codes</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={load}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Refresh stats
        </button>
      </div>
    </div>
  );
}
