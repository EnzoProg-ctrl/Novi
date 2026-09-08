const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export const IconArrowRight = (props) => (
  <svg {...base} {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const IconFlame = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3s5 4.2 5 8.6a5 5 0 01-10 0C7 9.4 9 7.6 9 7.6s.4 2.1 1.6 2.6C10.9 7.6 12 5.3 12 3z" />
  </svg>
)

export const IconClock = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const IconPlus = (props) => (
  <svg {...base} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconPackGrid = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </svg>
)

export const IconPackAtom = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <circle cx="12" cy="12" r="2.2" />
    <ellipse cx="12" cy="12" rx="9" ry="4.2" />
    <ellipse cx="12" cy="12" rx="4.2" ry="9" />
  </svg>
)

export const IconPackBook = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <path d="M5 4.5h9a3 3 0 013 3V20a2.5 2.5 0 00-2.5-2.5H5V4.5z" />
    <path d="M5 4.5A1.5 1.5 0 003.5 6v12A1.5 1.5 0 005 19.5" />
  </svg>
)
