import { useState } from "react";
import { saveCredentials } from "@/lib/api";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [baseUrl, setBaseUrl] = useState("https://your-service.onrender.com");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseUrl.trim() || !apiKey.trim()) {
      setError("Both fields are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url = baseUrl.replace(/\/$/, "");
      const res = await fetch(`${url}/api/admin/stats`, {
        headers: { "x-admin-key": apiKey },
      });
      if (res.status === 401) throw new Error("Invalid API key.");
      if (res.status === 503) throw new Error("ADMIN_API_KEY not set on the server.");
      if (!res.ok) throw new Error(`Server returned ${res.status}.`);
      saveCredentials(url, apiKey);
      onLogin();
    } catch (err: any) {
      setError(err.message || "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-4">
            <span className="text-2xl">🤖</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Nova Admin</h1>
          <p className="text-gray-400 mt-1 text-sm">Connect to your bot dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Backend URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-service.onrender.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Admin API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your ADMIN_API_KEY"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">
          Set <code className="text-gray-500">ADMIN_API_KEY</code> as an env var on your Render service.
        </p>
      </div>
    </div>
  );
}
