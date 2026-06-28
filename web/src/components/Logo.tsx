// Vantage mark: a mountain whose internal ridgelines form a binary tree —
// root node at the summit, branching down to leaves. Code structure as terrain.
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Vantage"
    >
      <defs>
        <linearGradient id="vg-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4a40" />
          <stop offset="1" stopColor="#212b26" />
        </linearGradient>
      </defs>

      {/* mountain body */}
      <path
        d="M5 41 L24 6 L43 41 Z"
        fill="url(#vg-grad)"
        stroke="#6fae6a"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* binary-tree ridgelines */}
      <g stroke="#e08a3c" strokeWidth="1.8" strokeLinecap="round">
        <line x1="24" y1="11" x2="16" y2="24" />
        <line x1="24" y1="11" x2="32" y2="24" />
        <line x1="16" y1="24" x2="11" y2="35" />
        <line x1="16" y1="24" x2="21" y2="35" />
        <line x1="32" y1="24" x2="27" y2="35" />
        <line x1="32" y1="24" x2="37" y2="35" />
      </g>

      {/* nodes — summit root + leaves */}
      <g fill="#f0a85c">
        <circle cx="24" cy="11" r="3" />
        <circle cx="16" cy="24" r="2.4" />
        <circle cx="32" cy="24" r="2.4" />
        <circle cx="11" cy="35" r="2" />
        <circle cx="21" cy="35" r="2" />
        <circle cx="27" cy="35" r="2" />
        <circle cx="37" cy="35" r="2" />
      </g>
    </svg>
  )
}
