// Chart libraries (recharts here) render to SVG with literal color values
// passed as props — unlike DOM elements styled with Tailwind utility
// classes, they don't respond to the "dark" class on <html> on their own.
// useChartTheme() reads the same design tokens index.css defines as
// --color-* CSS variables (via getComputedStyle) so chart chrome — grid
// lines, axis labels, tooltip background/text — tracks light/dark instead
// of staying hardcoded to one theme. It re-reads whenever <html>'s class
// attribute changes, so a theme switch in Settings (or a live OS change
// while "System" is selected) updates any chart already on screen, not
// just ones mounted after the switch.
//
// Per-series data colors (a pie slice, an area chart's line) are
// deliberately NOT part of this — those come from user-chosen category
// colors or a fixed palette, and are meant to stay put across themes.

import { useEffect, useState } from "react";

function readColor(varName) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw ? `rgb(${raw.replace(/\s+/g, ", ")})` : undefined;
}

function readChartTheme() {
  return {
    grid: readColor("--color-line"),
    axisText: readColor("--color-ink-500"),
    legendText: readColor("--color-ink-700"),
    tooltipBg: readColor("--color-surface"),
    tooltipBorder: readColor("--color-line"),
    tooltipText: readColor("--color-ink-900"),
  };
}

export function useChartTheme() {
  const [theme, setTheme] = useState(readChartTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readChartTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
