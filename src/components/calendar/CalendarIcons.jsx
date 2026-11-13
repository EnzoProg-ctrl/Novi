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
}

export const IconChevronLeft = (props) => (
  <svg {...base} {...props}><path d="m15 6-6 6 6 6" /></svg>
)

export const IconChevronRight = (props) => (
  <svg {...base} {...props}><path d="m9 6 6 6-6 6" /></svg>
)

export const IconClockSmall = (props) => (
  <svg {...base} width={14} height={14} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IconBook = (props) => (
  <svg {...base} width={14} height={14} {...props}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" />
  </svg>
)
