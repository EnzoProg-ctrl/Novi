/**
 * Novi's buddy mascot. Deliberately simple: a friendly shape, not a cartoon.
 * `mood` nudges the mouth so the same character can read as calm, happy, or thinking.
 */
export function Mascot({ size = 64, mood = 'happy', className = '' }) {
  const mouth = {
    happy: 'M25 41.5c1.9 2.4 4.2 3.6 7 3.6s5.1-1.2 7-3.6',
    calm: 'M26 42.5h12',
    thinking: 'M26 43c2.2-1.6 4.4-2.2 6.6-1.8',
  }[mood] ?? 'M25 41.5c1.9 2.4 4.2 3.6 7 3.6s5.1-1.2 7-3.6'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Novi buddy"
    >
      {/* antenna */}
      <path d="M32 17V10" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="7" r="3.2" fill="var(--coral)" />

      {/* body */}
      <rect x="8" y="17" width="48" height="40" rx="15" fill="var(--coral)" />

      {/* face plate keeps the eyes readable on the coral */}
      <rect x="14" y="24" width="36" height="26" rx="12" fill="#fff" opacity="0.96" />

      {/* eyes */}
      <circle cx="25" cy="34" r="3.1" fill="var(--ink)" />
      <circle cx="39" cy="34" r="3.1" fill="var(--ink)" />

      {/* mouth */}
      <path
        d={mouth}
        stroke="var(--ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* cheeks */}
      <circle cx="18.5" cy="39.5" r="2" fill="var(--coral)" opacity="0.32" />
      <circle cx="45.5" cy="39.5" r="2" fill="var(--coral)" opacity="0.32" />
    </svg>
  )
}

/** Wordmark used in the top bar and on the landing page. */
export function Logo({ size = 26 }) {
  return (
    <span className="logo">
      <Mascot size={size} />
      <span className="logo-text">Novi</span>
    </span>
  )
}
