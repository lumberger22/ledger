/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F5F5F1',
        surface: '#FFFFFF',
        ink: {
          900: '#1F2421',
          700: '#3C4440',
          500: '#6B756F',
          300: '#A8B0AA',
        },
        accent: {
          DEFAULT: '#2A6F6A',
          dark: '#1E514D',
          light: '#E4EFEE',
        },
        good: '#3F8C5F',
        warn: '#C7902E',
        over: '#B4483B',
        line: '#E4E3DC',
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
