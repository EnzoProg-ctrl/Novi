const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const IconCheckCircle = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 5-5.5" />
  </svg>
)

export const IconBars = (props) => (
  <svg {...base} {...props}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V7M17 16v-8" />
  </svg>
)

export const IconUp = (props) => (
  <svg {...base} width={14} height={14} {...props}><path d="m6 15 6-6 6 6" /></svg>
)

export const IconDown = (props) => (
  <svg {...base} width={14} height={14} {...props}><path d="m6 9 6 6 6-6" /></svg>
)

export const IconPlay = (props) => (
  <svg {...base} width={15} height={15} {...props}><path d="M8 5.5v13l10-6.5-10-6.5Z" /></svg>
)

export const IconLayers = (props) => (
  <svg {...base} {...props}>
    <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16 8.5 4.5 8.5-4.5" />
  </svg>
)

export const IconCrosshair = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
)

export const IconLaptop = (props) => (
  <svg {...base} {...props}>
    <rect x="4.5" y="5.5" width="15" height="10" rx="1.5" />
    <path d="M2.5 18.5h19" />
  </svg>
)

export const IconDatabase = (props) => (
  <svg {...base} {...props}>
    <ellipse cx="12" cy="6" rx="7" ry="2.8" />
    <path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
    <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
  </svg>
)

export const IconAtom = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="1.6" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
  </svg>
)

export const IconBook = (props) => (
  <svg {...base} {...props}>
    <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h13.5v14H6a1.5 1.5 0 0 0-1.5 1.5v-14Z" />
    <path d="M4.5 19.5A1.5 1.5 0 0 0 6 21h13.5" />
  </svg>
)
