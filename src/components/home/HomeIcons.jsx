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

export const IconSparkle = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z" fill="currentColor" stroke="none" />
  </svg>
)

export const IconCards = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <rect x="4" y="6" width="12" height="14" rx="2" />
    <path d="M8 3.5h9A2.5 2.5 0 0119.5 6v11" />
  </svg>
)

export const IconBrain = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <path d="M12 5.5a2.8 2.8 0 00-5.3 1.2A2.7 2.7 0 005 9.4a2.8 2.8 0 001.4 2.4A2.8 2.8 0 008 17.2a2.7 2.7 0 004 1.1" />
    <path d="M12 5.5a2.8 2.8 0 015.3 1.2A2.7 2.7 0 0119 9.4a2.8 2.8 0 01-1.4 2.4A2.8 2.8 0 0116 17.2a2.7 2.7 0 01-4 1.1z" />
  </svg>
)

export const IconPencil = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <path d="M4 20l4.5-1.2L19.3 8A2.4 2.4 0 0016 4.7L5.2 15.5 4 20z" />
    <path d="M15.2 5.8l3 3" />
  </svg>
)

export const IconUpload = (props) => (
  <svg {...base} {...props} strokeWidth="1.8">
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
)
