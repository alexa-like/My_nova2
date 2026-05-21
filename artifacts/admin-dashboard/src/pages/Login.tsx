import { useState } from "react";
import { saveCredentials } from "@/lib/api";
import { Bot, Sparkles } from "lucide-react";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-key": apiKey.trim() },
      });
      if (res.status === 401) throw new Error("Invalid API key.");
      if (res.status === 503) throw new Error("ADMIN_API_KEY not set on the server.");
      if (!res.ok) throw new Error(`Server returned ${res.status}.`);
      saveCredentials(apiKey.trim());
      onLogin();
    } catch (err: any) {
      setError(err.message || "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.15) 0%, #050508 60%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 0 40px rgba(99,102,241,0.4)" }}
          >
            <Bot size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Nova Admin</h1>
          <p className="text-gray-400 mt-2 text-sm">Enter your admin key to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}
          >
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Admin API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
                autoFocus
                className="w-full rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
                onFocus={e => (e.target.style.borderColor = "rgba(99,102,241,0.7)")}
                onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            {error && (
              <div
                className="rounded-xl px-4 py-2.5 text-red-300 text-sm flex items-center gap-2"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <span className="text-red-400">⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: loading ? "none" : "0 0 20px rgba(99,102,241,0.3)" }}
            >
              {loading ? (
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <Sparkles size={15} />
              )}
              {loading ? "Connecting..." : "Access Dashboard"}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-gray-600 mt-5">
          Set <code className="text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded">ADMIN_API_KEY</code> as an environment variable
        </p>
      </div>
    </div>
  );
}
