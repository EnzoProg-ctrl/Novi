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
