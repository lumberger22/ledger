// Resolve light/dark before first paint, so the page never flashes light
// mode for a dark-mode user (or vice versa). Deliberately a tiny vanilla-JS
// duplicate of src/utils/theme.js's resolveTheme() logic rather than an
// import — this has to run synchronously during HTML parsing, before any
// module script (or even the stylesheet) is available.
//
// Shipped as its own same-origin file (not an inline <script> in
// index.html) specifically so it satisfies main.py's
// Content-Security-Policy `script-src 'self'` once that header is flipped
// from report-only to enforcing — an inline script would need an
// 'unsafe-inline' exception or a content hash to keep working there.
(function () {
  try {
    var theme = localStorage.getItem("budget_app_theme") || "system";
    var dark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {
    /* localStorage/matchMedia unavailable — fall back to light. */
  }
})();
