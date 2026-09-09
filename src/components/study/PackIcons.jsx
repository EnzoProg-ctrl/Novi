const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export const IconGridView = (props) => (
  <svg {...base} {...props}>
    <rect x="4" y="4" width="7" height="7" rx="1.6" />
    <rect x="13" y="4" width="7" height="7" rx="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.6" />
  </svg>
)

export const IconListView = (props) => (
  <svg {...base} {...props}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
)

export const IconStar = (props) => (
  <svg {...base} {...props}>
    <path d="M12 4l2.3 4.9 5.2.7-3.8 3.6.9 5.2L12 16l-4.6 2.4.9-5.2L4.5 9.6l5.2-.7L12 4z" />
  </svg>
)

export const IconChevronRight = (props) => (
  <svg {...base} {...props}>
    <path d="M9.5 6l6 6-6 6" />
  </svg>
)

export const IconDots = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
  </svg>
)
