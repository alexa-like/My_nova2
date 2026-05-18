import { Link, useLocation } from "wouter";
import { clearCredentials } from "@/lib/api";
import {
  LayoutDashboard, Users, Megaphone, Key, BarChart2,
  ScrollText, LogOut, Bot
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/broadcast", label: "Broadcast", icon: Megaphone },
  { href: "/codes", label: "Codes", icon: Key },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/logs", label: "Logs", icon: ScrollText },
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
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Bot size={16} />
          </div>
          <div>
            <div className="font-semibold text-sm text-white">Nova Admin</div>
            <div className="text-xs text-gray-500">Control Panel</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <a
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors w-full"
          >
            <LogOut size={16} />
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
