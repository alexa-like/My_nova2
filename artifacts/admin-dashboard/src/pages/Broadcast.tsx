import { useState } from "react";
import { api } from "@/lib/api";
import { Megaphone, CheckCircle } from "lucide-react";

export default function Broadcast() {
  const [message, setMessage] = useState("");
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!message.trim()) return;
    if (!confirm(`Send broadcast to ${premiumOnly ? "premium" : "all"} users?`)) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.broadcast(message, premiumOnly);
      setResult(res);
      setMessage("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const charCount = message.length;

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white">Broadcast</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send a message to all users</p>
      </div>

      {result && (
        <div className="bg-green-950 border border-green-800 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-300">
            <p className="font-medium">Broadcast sent</p>
            <p className="text-green-400 mt-0.5">
              {result.sent.toLocaleString()} delivered · {result.failed} failed · {result.total.toLocaleString()} total
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            placeholder="Write your broadcast message here...&#10;&#10;Supports Telegram markdown: *bold* _italic_ `code`"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
          <p className="text-right text-xs text-gray-600 mt-1">{charCount.toLocaleString()} chars</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={premiumOnly}
              onChange={(e) => setPremiumOnly(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
          <span className="text-sm text-gray-300">Premium users only</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-600">
            Messages are rate-limited (40ms delay per user) to avoid Telegram limits.
          </p>
          <button
            onClick={handleSend}
            disabled={!message.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Megaphone size={14} />
            {loading ? "Sending..." : "Send Broadcast"}
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Telegram Markdown</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <span><code className="text-gray-300">*text*</code> → <strong>bold</strong></span>
          <span><code className="text-gray-300">_text_</code> → <em>italic</em></span>
          <span><code className="text-gray-300">`code`</code> → inline code</span>
          <span><code className="text-gray-300">```block```</code> → code block</span>
        </div>
      </div>
    </div>
  );
}
