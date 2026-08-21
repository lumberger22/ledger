import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  LineChart,
  CircleDollarSign,
  Settings as SettingsIcon,
  Upload,
  LogOut,
  Landmark,
  TrendingUp,
  PieChart,
  Menu,
  X,
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-ink-900">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <rect x="3.5" y="6.5" width="17" height="12" rx="3" fill="none" stroke="white" strokeWidth="1.6" />
                <path d="M3.5 10.5 L20.5 8" stroke="white" strokeWidth="1.2" opacity="0.6" fill="none" strokeLinecap="round" />
                <circle cx="16" cy="13" r="1.7" fill="#C7902E" />
              </svg>
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

        <div className="flex items-center gap-1 sm:gap-2">
          {hasApiKey && onLogout && (
            <button
              onClick={onLogout}
              title="Lock app"
              className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 text-sm font-medium px-2 sm:px-2.5 py-2 rounded-lg hover:bg-black/5"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Lock</span>
            </button>
          )}
          <button
            onClick={open}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-2.5 sm:px-3.5 py-2 rounded-lg transition-colors shadow-card"
          >
            <Upload size={15} strokeWidth={2.25} />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="md:hidden flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-ink-700 hover:bg-black/5 transition-colors"
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.nav
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="md:hidden overflow-hidden border-t border-line bg-canvas"
          >
            <div className="px-3 py-2 space-y-0.5 max-h-[calc(100vh-4rem)] overflow-y-auto">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] font-medium transition-colors ${
                      isActive
                        ? "bg-accent-light text-accent-dark"
                        : "text-ink-700 hover:bg-black/5"
                    }`
                  }
                >
                  <Icon size={17} strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
