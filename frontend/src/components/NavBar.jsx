import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  LineChart,
  CircleDollarSign,
  Settings as SettingsIcon,
  Upload,
  Wallet,
  LogOut,
  Landmark,
  TrendingUp,
  PieChart,
} from "lucide-react";
import { useUploadModal } from "../context/UploadModalContext";
import { getStoredApiKey } from "../api/client";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/investments", label: "Investments", icon: PieChart },
  { to: "/net-worth", label: "Net Worth", icon: TrendingUp },
  { to: "/charges", label: "Charges", icon: Receipt },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/income", label: "Income", icon: CircleDollarSign },
  { to: "/analysis", label: "Analysis", icon: LineChart },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function NavBar({ onLogout }) {
  const { open } = useUploadModal();
  const hasApiKey = Boolean(getStoredApiKey());

  return (
    <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-ink-900">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <Wallet size={16} className="text-white" strokeWidth={2.25} />
            </div>
            <span className="font-display font-bold text-[15px] tracking-tight">
              Ledger
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent-light text-accent-dark"
                      : "text-ink-500 hover:text-ink-900 hover:bg-black/5"
                  }`
                }
              >
                <Icon size={15} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {hasApiKey && onLogout && (
            <button
              onClick={onLogout}
              title="Lock app"
              className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 text-sm font-medium px-2.5 py-2 rounded-lg hover:bg-black/5"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Lock</span>
            </button>
          )}
          <button
            onClick={open}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-card"
          >
            <Upload size={15} strokeWidth={2.25} />
            Upload
          </button>
        </div>
      </div>
      <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                isActive ? "bg-accent-light text-accent-dark" : "text-ink-500"
              }`
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
