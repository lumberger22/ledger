import { Link, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  Settings as SettingsIcon,
  Upload,
  LogOut,
  Landmark,
  Plus,
} from "lucide-react";
import { useUploadModal } from "../context/UploadModalContext";
import { getStoredApiKey } from "../api/client";
import Logo from "./Logo";

// Kept intentionally short (5, incl. Settings) so the nav reads as a set of
// major sections rather than a list of every page. Investments, Net Worth,
// Income, and Analysis are one level deeper — reached from Dashboard,
// Accounts, and Budget via in-page links — rather than living up here.
const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/charges", label: "Charges", icon: Receipt },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function NavBar({ onLogout }) {
  const { open } = useUploadModal();
  const hasApiKey = Boolean(getStoredApiKey());

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line/80 bg-surface/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-7">
            <div className="flex items-center gap-2.5 text-ink-900">
              <Logo size={30} />
              <span className="font-display text-base font-bold tracking-tight sm:text-[17px]">
                Ledger Financial
              </span>
            </div>
            <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-accent-light text-accent-dark"
                        : "text-ink-500 hover:bg-canvas hover:text-ink-900"
                    }`
                  }
                >
                  <Icon size={16} strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/charges?add=1"
              aria-label="Add a charge"
              className="hidden min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink-700 transition-colors hover:bg-canvas md:inline-flex"
            >
              <Plus size={16} /> Add Charge
            </Link>
            {hasApiKey && onLogout && (
              <button
                onClick={onLogout}
                title="Log out"
                aria-label="Log out"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 sm:w-auto sm:gap-1.5 sm:px-3"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Log out</span>
              </button>
            )}
            <button
              onClick={open}
              aria-label="Upload transactions"
              className="flex h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-accent-dark sm:px-4"
            >
              <Upload size={16} strokeWidth={2.25} />
              <span className="hidden sm:inline">Upload</span>
            </button>
          </div>
        </div>
      </header>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/90 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 px-1 pt-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition-colors ${
                  isActive ? "text-accent-dark" : "text-ink-500 hover:text-ink-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 min-w-12 items-center justify-center rounded-full transition-colors ${isActive ? "bg-accent-light" : ""}`}>
                    <Icon size={18} strokeWidth={isActive ? 2.3 : 1.9} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <Link
        to="/charges?add=1"
        aria-label="Add a charge"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform active:scale-95 md:hidden"
      >
        <Plus size={24} strokeWidth={2.25} />
      </Link>
    </>
  );
}
