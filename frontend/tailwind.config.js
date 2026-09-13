/** @type {import('tailwindcss').Config} */
export default {
  // Class-based (not 'media') so a user's explicit Light/Dark/System choice
  // in Settings — applied via utils/theme.js — always wins over just
  // reading prefers-color-scheme directly. "System" is handled in JS by
  // toggling this same class to match the OS setting, so it still tracks
  // prefers-color-scheme live; see index.html's inline bootstrap script and
  // utils/theme.js for how the class gets set before/after paint.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Each value is a CSS variable (defined for both themes in
        // index.css) wrapped in Tailwind's `<alpha-value>` pattern, so
        // every existing opacity-modifier class (bg-accent/50, over/30,
        // accent-light/70, ...) keeps working unchanged in both themes.
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        ink: {
          900: 'rgb(var(--color-ink-900) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          300: 'rgb(var(--color-ink-300) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          dark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
          light: 'rgb(var(--color-accent-light) / <alpha-value>)',
        },
        good: 'rgb(var(--color-good) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        over: 'rgb(var(--color-over) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Manrope"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl2: '1.1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(31, 36, 33, 0.04), 0 4px 16px rgba(31, 36, 33, 0.05)',
        cardHover: '0 2px 6px rgba(31, 36, 33, 0.06), 0 8px 24px rgba(31, 36, 33, 0.08)',
      },
    },
  },
  plugins: [],
}
