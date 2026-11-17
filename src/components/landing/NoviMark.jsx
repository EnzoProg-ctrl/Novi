/** Novi's coral double-bar mark, used in the landing nav and footer. */
export function NoviMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="11" height="26" rx="4" fill="#ff6b5a" />
      <rect x="17" y="4" width="11" height="26" rx="4" fill="#ffa294" />
    </svg>
  )
}
