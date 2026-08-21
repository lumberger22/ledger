// The Ledger Financial wordmark — a small teal rounded-square with a card
// outline + coin, reused anywhere the brand mark shows up (nav bar, login
// screen, etc.) so it only needs to be drawn once.
export default function Logo({ size = 28, className = "" }) {
  const iconSize = Math.round(size * 0.57);
  return (
    <div
      className={`rounded-lg bg-accent flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        aria-hidden="true"
      >
        <rect
          x="3.5"
          y="6.5"
          width="17"
          height="12"
          rx="3"
          fill="none"
          stroke="white"
          strokeWidth="1.6"
        />
        <path
          d="M3.5 10.5 L20.5 8"
          stroke="white"
          strokeWidth="1.2"
          opacity="0.6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="16" cy="13" r="1.7" fill="#C7902E" />
      </svg>
    </div>
  );
}
