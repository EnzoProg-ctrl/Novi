/* Icons used only by AI Chat. All inherit currentColor. */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export const IconSend = (props) => (
  <svg {...base} {...props}>
    <path d="M5 12h13M12.5 6l6 6-6 6" />
  </svg>
)

export const IconPaperclip = (props) => (
  <svg {...base} {...props}>
    <path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.3-8.3a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.4-7.4" />
  </svg>
)

export const IconCopy = (props) => (
  <svg {...base} {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
    <path d="M15.5 8.5V6.7a2.2 2.2 0 00-2.2-2.2H6.7a2.2 2.2 0 00-2.2 2.2v6.6a2.2 2.2 0 002.2 2.2h1.8" />
  </svg>
)

export const IconCheck = (props) => (
  <svg {...base} {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const IconRefresh = (props) => (
  <svg {...base} {...props}>
    <path d="M19.5 12a7.5 7.5 0 01-13.1 5M4.5 12a7.5 7.5 0 0113.1-5" />
    <path d="M17.8 3.5v3.7h-3.7M6.2 20.5v-3.7h3.7" />
  </svg>
)

export const IconThumbUp = (props) => (
  <svg {...base} {...props}>
    <path d="M7.5 10.5v9h-3v-9h3zM7.5 10.5l3.6-6.2a1.6 1.6 0 012.9 1.1l-.6 3.6h5a1.8 1.8 0 011.8 2.1l-1.1 6.6a2 2 0 01-2 1.8H7.5" />
  </svg>
)

export const IconThumbDown = (props) => (
  <svg {...base} {...props}>
    <path d="M16.5 13.5v-9h3v9h-3zM16.5 13.5l-3.6 6.2a1.6 1.6 0 01-2.9-1.1l.6-3.6h-5a1.8 1.8 0 01-1.8-2.1l1.1-6.6a2 2 0 012-1.8h9.6" />
  </svg>
)

export const IconPlus = (props) => (
  <svg {...base} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconX = (props) => (
  <svg {...base} {...props}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
)

export const IconBook = (props) => (
  <svg {...base} {...props}>
    <path d="M5 5.5A2 2 0 017 3.5h12v14H7a2 2 0 00-2 2V5.5z" />
    <path d="M5 19.5a2 2 0 002 2h12v-4" />
  </svg>
)

export const IconBulb = (props) => (
  <svg {...base} {...props}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0012 3z" />
  </svg>
)

export const IconQuiz = (props) => (
  <svg {...base} {...props}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
    <path d="M8.5 9l1.5 1.5L13 7.5M8.5 15l1.5 1.5L13 13.5M15 9.5h1M15 15.5h1" />
  </svg>
)

export const IconNotes = (props) => (
  <svg {...base} {...props}>
    <path d="M14.5 3.5H7A2 2 0 005 5.5v13a2 2 0 002 2h10a2 2 0 002-2V8l-4.5-4.5z" />
    <path d="M14.5 3.5V8H19M8.5 12.5h7M8.5 16h5" />
  </svg>
)

export const IconTarget = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </svg>
)

export const IconBubble = (props) => (
  <svg {...base} {...props}>
    <path d="M20 14.5a2.5 2.5 0 01-2.5 2.5H9l-4 3.5V6.5A2.5 2.5 0 017.5 4h10A2.5 2.5 0 0120 6.5v8z" />
    <path d="M8.5 9h7M8.5 12.5h4.5" />
  </svg>
)

export const IconPanel = (props) => (
  <svg {...base} {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M14.5 4.5v15" />
  </svg>
)

export const IconDots = (props) => (
  <svg {...base} {...props}>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

export const IconPencil = (props) => (
  <svg {...base} {...props}>
    <path d="M4.5 19.5l4-1 10-10a2.1 2.1 0 00-3-3l-10 10-1 4z" />
    <path d="M14 7l3 3" />
  </svg>
)

export const IconTrash = (props) => (
  <svg {...base} {...props}>
    <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2M6.5 7l.8 11.6A2 2 0 009.3 20.5h5.4a2 2 0 002-1.9L17.5 7" />
    <path d="M10 11v5.5M14 11v5.5" />
  </svg>
)
