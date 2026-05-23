import { useEffect, useState } from "react";
import { api, type BotConfigData } from "@/lib/api";
import { Save, RefreshCw, AlertTriangle, CheckCircle, Settings, Sliders, Brain, Wrench, FlaskConical, Loader2 } from "lucide-react";

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: "rgba(99,102,241,0.8)" }} />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function LimitRow({ label, freeKey, premiumKey, values, onChange }: {
  label: string;
  freeKey: string;
  premiumKey: string;
  values: Record<string, number>;
  onChange: (key: string, val: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-3">
      <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <div className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Free</span>
        <input
          type="number"
          min={0}
          value={values[freeKey] ?? 0}
          onChange={e => onChange(freeKey, Number(e.target.value))}
          className="w-full rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Premium</span>
        <input
          type="number"
          min={0}
          value={values[premiumKey] ?? 0}
          onChange={e => onChange(premiumKey, Number(e.target.value))}
          className="w-full rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.25)" }}
        />
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-white">{label}</p>
        {desc && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors"
        style={{ background: checked ? "linear-gradient(135deg,#6366f1,#a855f7)" : "rgba(255,255,255,0.1)" }}
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5"
          style={{ transform: checked ? "translateX(1.1rem)" : "translateX(0.1rem)" }}
        />
      </button>
    </div>
  );
}

type TestStatus = { state: "idle" } | { state: "loading" } | { state: "ok"; latencyMs: number; detail?: string } | { state: "error"; error: string; latencyMs: number };

function ModelTestBadge({ status }: { status: TestStatus }) {
  if (status.state === "idle") return null;
  if (status.state === "loading") {
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
        <Loader2 size={10} className="animate-spin" /> testing…
      </span>
    );
  }
  if (status.state === "ok") {
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
        ✓ {status.latencyMs}ms{status.detail ? ` · ${status.detail}` : ""}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }} title={status.error}>
      ✗ {status.latencyMs}ms · {status.error.substring(0, 60)}
    </span>
  );
}

export default function BotConfig() {
  const [config, setConfig] = useState<BotConfigData | null>(null);
  const [limits, setLimits] = useState<BotConfigData["usageLimits"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [chatTestStatus, setChatTestStatus] = useState<TestStatus>({ state: "idle" });
  const [imageTestStatus, setImageTestStatus] = useState<TestStatus>({ state: "idle" });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getBotConfig();
      setConfig(data);
      setLimits({ ...data.usageLimits });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(""), 3000); };

  const handleTestChat = async () => {
    if (!config?.activeChatModel) return;
    setChatTestStatus({ state: "loading" });
    try {
      const result = await api.testChatModel(config.activeChatModel);
      if (result.ok) {
        setChatTestStatus({ state: "ok", latencyMs: result.latencyMs, detail: result.reply?.substring(0, 40) });
      } else {
        setChatTestStatus({ state: "error", error: result.error || "No response", latencyMs: result.latencyMs });
      }
    } catch (err: any) {
      setChatTestStatus({ state: "error", error: err.message, latencyMs: 0 });
    }
  };

  const handleTestImage = async () => {
    if (!config?.activeImageModel) return;
    setImageTestStatus({ state: "loading" });
    try {
      const result = await api.testImageModel(config.activeImageModel);
      if (result.ok) {
        const detail = result.source ? result.source : result.bytes ? `${Math.round(result.bytes / 1024)}KB` : undefined;
        setImageTestStatus({ state: "ok", latencyMs: result.latencyMs, detail });
      } else {
        setImageTestStatus({ state: "error", error: result.error || "Generation failed", latencyMs: result.latencyMs });
      }
    } catch (err: any) {
      setImageTestStatus({ state: "error", error: err.message, latencyMs: 0 });
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      await api.updateBotConfig({
        activeChatModel: config.activeChatModel,
        activeImageModel: config.activeImageModel,
        premiumEmojiEnabled: config.premiumEmojiEnabled,
        maintenanceMode: config.maintenanceMode,
        welcomeMessage: config.welcomeMessage,
        botPersonality: config.botPersonality,
      });
      flash("Configuration saved.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLimits = async () => {
    if (!limits) return;
    setSavingLimits(true);
    setError("");
    try {
      await api.updateLimits(limits);
      flash("Usage limits updated.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingLimits(false);
    }
  };

  const setLimitVal = (key: string, val: number) => {
    setLimits(prev => prev ? { ...prev, [key]: val } : prev);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!config || !limits) {
    return (
      <div className="p-6">
        <div className="rounded-2xl p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          {error || "Failed to load config"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Bot Config</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Models, limits, and behavior</p>
        </div>
        <button onClick={load} style={{ color: "rgba(255,255,255,0.3)" }} className="transition-colors hover:text-white">
          <RefreshCw size={15} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-3 flex items-center gap-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl p-3 flex items-center gap-2 text-sm" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>
          <CheckCircle size={14} /> {success}
        </div>
      )}

      <Section title="Active Models" icon={Brain}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Chat Model</label>
              <div className="flex items-center gap-2">
                <ModelTestBadge status={chatTestStatus} />
                <button
                  onClick={() => { setChatTestStatus({ state: "idle" }); handleTestChat(); }}
                  disabled={chatTestStatus.state === "loading"}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "rgba(165,168,255,0.9)" }}
                >
                  <FlaskConical size={10} />
                  Test
                </button>
              </div>
            </div>
            <input
              type="text"
              value={config.activeChatModel || ""}
              onChange={e => { setConfig(prev => prev ? { ...prev, activeChatModel: e.target.value } : prev); setChatTestStatus({ state: "idle" }); }}
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              placeholder="e.g. meta-llama/llama-3.3-70b-instruct:free"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Image Model</label>
              <div className="flex items-center gap-2">
                <ModelTestBadge status={imageTestStatus} />
                <button
                  onClick={() => { setImageTestStatus({ state: "idle" }); handleTestImage(); }}
                  disabled={imageTestStatus.state === "loading"}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "rgba(165,168,255,0.9)" }}
                >
                  <FlaskConical size={10} />
                  Test
                </button>
              </div>
            </div>
            <input
              type="text"
              value={config.activeImageModel || ""}
              onChange={e => { setConfig(prev => prev ? { ...prev, activeImageModel: e.target.value } : prev); setImageTestStatus({ state: "idle" }); }}
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              placeholder="e.g. stabilityai/stable-diffusion-xl-base-1.0"
            />
          </div>

          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            Chat: OpenRouter model ID (e.g. <span className="font-mono">meta-llama/llama-3.3-70b-instruct:free</span>). Image: HuggingFace model ID (e.g. <span className="font-mono">stabilityai/stable-diffusion-xl-base-1.0</span>).
          </p>
        </div>
      </Section>

      <Section title="Behavior" icon={Settings}>
        <Toggle
          label="Maintenance Mode"
          desc="All users see a maintenance message"
          checked={config.maintenanceMode}
          onChange={v => setConfig(prev => prev ? { ...prev, maintenanceMode: v } : prev)}
        />
        <Toggle
          label="Premium Emoji"
          desc="Enable animated emoji for premium users"
          checked={config.premiumEmojiEnabled}
          onChange={v => setConfig(prev => prev ? { ...prev, premiumEmojiEnabled: v } : prev)}
        />
        <div>
          <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>Welcome Message</label>
          <textarea
            rows={3}
            value={config.welcomeMessage || ""}
            onChange={e => setConfig(prev => prev ? { ...prev, welcomeMessage: e.target.value } : prev)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            placeholder="Sent to new users..."
          />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>Bot Personality</label>
          <textarea
            rows={4}
            value={config.botPersonality || ""}
            onChange={e => setConfig(prev => prev ? { ...prev, botPersonality: e.target.value } : prev)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            placeholder="System prompt / personality for the AI..."
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
          >
            <Save size={13} />
            {saving ? "Saving..." : "Save Config"}
          </button>
        </div>
      </Section>

      <Section title="Usage Limits" icon={Sliders}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 pb-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>Feature</span>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>Free / period</span>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(168,85,247,0.7)" }}>Premium / period</span>
          </div>
          <LimitRow label="Messages" freeKey="freeMessages" premiumKey="premiumMessages" values={limits} onChange={setLimitVal} />
          <LimitRow label="Images" freeKey="freeImages" premiumKey="premiumImages" values={limits} onChange={setLimitVal} />
          <LimitRow label="Builds" freeKey="freeBuilds" premiumKey="premiumBuilds" values={limits} onChange={setLimitVal} />
          <div className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Reset every (hours)</span>
              <input
                type="number"
                min={1}
                value={limits.resetIntervalHours}
                onChange={e => setLimitVal("resetIntervalHours", Number(e.target.value))}
                className="w-24 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSaveLimits}
            disabled={savingLimits}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
          >
            <Save size={13} />
            {savingLimits ? "Saving..." : "Save Limits"}
          </button>
        </div>
      </Section>
    </div>
  );
}
