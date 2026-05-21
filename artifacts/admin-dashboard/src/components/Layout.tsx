import { Link, useLocation } from "wouter";
import { clearCredentials } from "@/lib/api";
import {
  LayoutDashboard, Users, Megaphone, Key, BarChart2,
  ScrollText, LogOut, Bot, Settings, Globe
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/groups", label: "Groups", icon: Globe },
  { href: "/broadcast", label: "Broadcast", icon: Megaphone },
  { href: "/codes", label: "Codes", icon: Key },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/config", label: "Bot Config", icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const [location] = useLocation();

  const handleLogout = () => {
    clearCredentials();
    onLogout();
  };

  return (
    <div
      className="flex h-screen text-white overflow-hidden"
      style={{ background: "#050508" }}
    >
      <aside
        className="w-56 flex-shrink-0 flex flex-col"
        style={{ background: "rgba(255,255,255,0.02)", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="p-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 0 12px rgba(99,102,241,0.4)" }}
          >
            <Bot size={16} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm text-white">Nova Admin</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Control Panel</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <a
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all"
                  style={
                    active
                      ? { background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.15))", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }
                      : { color: "rgba(255,255,255,0.4)", border: "1px solid transparent" }
                  }
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget as HTMLElement).style.background = ""; } }}
                >
                  <Icon size={15} />
                  {label}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm w-full transition-all"
            style={{ color: "rgba(255,255,255,0.3)", border: "1px solid transparent" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.3)"; (e.currentTarget as HTMLElement).style.background = ""; }}
          >
            <LogOut size={15} />
            Disconnect
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
