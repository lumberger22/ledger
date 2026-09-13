// Light/dark theme resolution, shared between index.html's pre-paint
// bootstrap script (a small inline duplicate — see that file, since it runs
// before any module can be imported) and the app's own theme handling in
// App.jsx / Settings.jsx.
//
// A theme is one of "light" | "dark" | "system". "system" resolves against
// the OS/browser's prefers-color-scheme and keeps following it live via
// watchSystemTheme(). The resolved result is applied as a "dark" class on
// <html> — see tailwind.config.js's darkMode: 'class' and index.css's
// :root.dark block, which is what every bg-canvas/text-ink-900/etc. utility
// class across the app actually responds to.

const STORAGE_KEY = "budget_app_theme";

export function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "system";
  } catch {
    return "system";
  }
}

export function setStoredTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore — worst case, the next load re-resolves from system
    // preference instead of the last explicit choice.
  }
}

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(theme) {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

/** Apply a theme choice to the document immediately — no re-render needed. */
export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

let systemListenerAttached = false;

/**
 * Keep the page in sync with OS-level theme changes while the stored
 * choice is "system". Safe to call more than once — only attaches once.
 */
export function watchSystemTheme() {
  if (systemListenerAttached || typeof window === "undefined" || !window.matchMedia) {
    return;
  }
  systemListenerAttached = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStoredTheme() === "system") {
      applyTheme("system");
    }
  });
}
