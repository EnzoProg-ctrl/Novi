/* Icon set for the signed-in app shell. All inherit currentColor. */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export const IconHome = (props) => (
  <svg {...base} {...props}>
    <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19v-8.5z" />
  </svg>
)

export const IconPacks = (props) => (
  <svg {...base} {...props}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9 4v16" />
  </svg>
)

export const IconCalendar = (props) => (
  <svg {...base} {...props}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
)

export const IconProgress = (props) => (
  <svg {...base} {...props}>
    <path d="M6 19v-6M12 19V5M18 19v-9" />
  </svg>
)

export const IconChat = (props) => (
  <svg {...base} {...props}>
    <path d="M20 15a2.5 2.5 0 01-2.5 2.5H9l-4 3.5V7A2.5 2.5 0 017.5 4.5h10A2.5 2.5 0 0120 7v8z" />
  </svg>
)

export const IconSettings = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5l1.4 2.3 2.7-.5.4 2.7 2.4 1.3-1.3 2.4 1.3 2.4-2.4 1.3-.4 2.7-2.7-.5L12 21.5l-1.4-2.3-2.7.5-.4-2.7-2.4-1.3L6.4 13 5.1 10.6l2.4-1.3.4-2.7 2.7.5L12 2.5z" />
  </svg>
)

export const IconUpload = (props) => (
  <svg {...base} {...props}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
)

export const IconSearch = (props) => (
  <svg {...base} {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
)

export const IconBell = (props) => (
  <svg {...base} {...props}>
    <path d="M18 15.5V11a6 6 0 10-12 0v4.5L4.5 18h15L18 15.5z" />
    <path d="M10 20.5a2.2 2.2 0 004 0" />
  </svg>
)

export const IconChevronDown = (props) => (
  <svg {...base} {...props}>
    <path d="M6 9.5l6 6 6-6" />
  </svg>
)

export const IconMenu = (props) => (
  <svg {...base} {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const IconClose = (props) => (
  <svg {...base} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

/** The coral double-bar wordmark. */
export const NoviMark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="11" height="26" rx="4" fill="var(--coral)" />
    <rect x="17" y="4" width="11" height="26" rx="4" fill="#ffa294" />
  </svg>
)
