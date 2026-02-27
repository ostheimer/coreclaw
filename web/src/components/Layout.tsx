import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  FileEdit,
  Phone,
  Activity,
  Puzzle,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/drafts", icon: FileEdit, label: "Entwürfe" },
  { to: "/notes", icon: Phone, label: "Notizen" },
  { to: "/activity", icon: Activity, label: "Aktivität" },
  { to: "/skills", icon: Puzzle, label: "Skills" },
  { to: "/settings", icon: Settings, label: "Einstellungen" },
];

export function Layout({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ backgroundColor: "var(--color-sidebar)" }}>
        <div className="px-5 py-5 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
            CC
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">CoreClaw</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-700">
          <div className="flex items-center gap-2 text-xs">
            {connected ? (
              <>
                <Wifi size={14} className="text-green-400" />
                <span className="text-green-400">Verbunden</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-red-400" />
                <span className="text-red-400">Getrennt</span>
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}
