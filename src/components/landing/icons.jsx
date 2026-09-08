/* Small stroke icon set for the landing page. All inherit currentColor. */

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export const IconSparkle = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" fill="currentColor" stroke="none" />
  </svg>
)

export const IconArrowRight = (props) => (
  <svg {...base} {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const IconUpload = (props) => (
  <svg {...base} {...props}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
)

export const IconDocument = (props) => (
  <svg {...base} {...props}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
)

export const IconPerson = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
  </svg>
)

export const IconChart = (props) => (
  <svg {...base} {...props}>
    <path d="M6 19v-6M12 19V5M18 19v-9" />
  </svg>
)

export const IconHome = (props) => (
  <svg {...base} {...props}>
    <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19v-8.5z" />
  </svg>
)

export const IconTools = (props) => (
  <svg {...base} {...props}>
    <path d="M14 3h7v7M21 3l-8.5 8.5" />
    <path d="M10 21H3v-7M3 21l8.5-8.5" />
  </svg>
)

export const IconCalendar = (props) => (
  <svg {...base} {...props}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
)

export const IconSettings = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5l1.4 2.3 2.7-.5.4 2.7 2.4 1.3-1.3 2.4 1.3 2.4-2.4 1.3-.4 2.7-2.7-.5L12 21.5l-1.4-2.3-2.7.5-.4-2.7-2.4-1.3L6.4 13 5.1 10.6l2.4-1.3.4-2.7 2.7.5L12 2.5z" />
  </svg>
)

export const IconPlus = (props) => (
  <svg {...base} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconDots = (props) => (
  <svg {...base} {...props}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconGrid = (props) => (
  <svg {...base} {...props}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </svg>
)

export const IconAtom = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="2.2" />
    <ellipse cx="12" cy="12" rx="9" ry="4.2" />
    <ellipse cx="12" cy="12" rx="4.2" ry="9" />
  </svg>
)

export const IconBook = (props) => (
  <svg {...base} {...props}>
    <path d="M5 4.5h9a3 3 0 013 3V20a2.5 2.5 0 00-2.5-2.5H5V4.5z" />
    <path d="M5 4.5A1.5 1.5 0 003.5 6v12A1.5 1.5 0 005 19.5" />
  </svg>
)
