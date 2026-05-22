import { useEffect, useState } from "react";
import { api, type Code } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Plus, Copy, RefreshCw, Zap } from "lucide-react";

export default function Codes() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDuration, setNewDuration] = useState("30d");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkDuration, setBulkDuration] = useState("30d");
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getCodes();
      setCodes(res.codes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setNewCode(`NOVA-${part(4)}-${part(4)}`);
  };

  const handleCreate = async () => {
    if (!newCode.trim() || !newDuration.trim()) return;
    setCreating(true);
    setError("");
    try {
      await api.createCode(newCode.trim(), newDuration.trim());
      setNewCode("");
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleBulkGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      await api.generateCodes(bulkCount, bulkDuration);
      setShowBulk(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
  };

  const copyAll = () => {
    const available = codes.filter((c) => !c.used).map((c) => c.code).join("\n");
    if (available) navigator.clipboard.writeText(available).catch(() => {});
  };

  const durations = ["1d", "7d", "30d", "90d", "1y", "lifetime"];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Redeem Codes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{codes.length} total codes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-gray-500 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => { setShowBulk(!showBulk); setShowForm(false); }}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            <Zap size={14} />
            Bulk
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowBulk(false); }}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={14} />
            New Code
          </button>
        </div>
      </div>

      {showBulk && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Bulk Generate Codes</h3>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Count (max 100)</p>
              <input
                type="number"
                min={1}
                max={100}
                value={bulkCount}
                onChange={(e) => setBulkCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Duration</p>
            <div className="flex gap-2 flex-wrap">
              {durations.map((d) => (
                <button
                  key={d}
                  onClick={() => setBulkDuration(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    bulkDuration === d
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowBulk(false)}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkGenerate}
              disabled={generating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {generating ? "Generating..." : `Generate ${bulkCount} Codes`}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Create Code</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="NOVA-XXXX-XXXX"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono uppercase"
            />
            <button
              onClick={generateCode}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
            >
              Generate
            </button>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Duration</p>
            <div className="flex gap-2 flex-wrap">
              {durations.map((d) => (
                <button
                  key={d}
                  onClick={() => setNewDuration(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    newDuration === d
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newCode.trim() || creating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
          <span className="text-xs text-gray-500">{codes.filter(c => !c.used).length} available</span>
          <button
            onClick={copyAll}
            className="text-xs text-gray-500 hover:text-white transition-colors"
            title="Copy all available codes"
          >
            Copy available
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Created</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Copy</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-500">Loading...</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-500">No codes yet</td></tr>
            ) : codes.map((code) => (
              <tr key={code._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-white text-xs">{code.code}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{code.duration}</td>
                <td className="px-4 py-3">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    code.used
                      ? "bg-gray-800 text-gray-500 border border-gray-700"
                      : "bg-green-900/50 text-green-400 border border-green-800"
                  }`}>
                    {code.used ? "Used" : "Available"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                  {formatDate(code.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => copyCode(code.code)}
                    className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
                  >
                    <Copy size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
