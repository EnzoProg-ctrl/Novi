/** Glyphs for the session types. Shape, not just colour, tells them apart. */

function Glyph({ children, ...props }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

export function IconFocus(props) {
  return <Glyph {...props}><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></Glyph>
}

export function IconPractice(props) {
  return <Glyph {...props}><path d="M6 6a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9V10" /><path d="M8 12.5v.01" /></Glyph>
}

export function IconRevision(props) {
  return (
    <Glyph {...props}>
      <path d="M3 8a5 5 0 0 1 8.6-3.5L13 6" /><path d="M13 3v3h-3" />
      <path d="M13 8a5 5 0 0 1-8.6 3.5L3 10" /><path d="M3 13v-3h3" />
    </Glyph>
  )
}

export function IconBreak(props) {
  return <Glyph {...props}><path d="M3 6h8v3.5A3.5 3.5 0 0 1 7.5 13h-1A3.5 3.5 0 0 1 3 9.5V6Z" /><path d="M11 7h1a1.5 1.5 0 0 1 0 3h-1" /></Glyph>
}

export function IconCheck(props) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  )
}
