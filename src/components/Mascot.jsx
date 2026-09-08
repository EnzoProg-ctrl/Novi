import capybara from '../assets/capybara-avatar.webp'

/**
 * Novi's face, used wherever the buddy appears in the signed-in app.
 *
 * This is the same capybara artwork as the landing hero, trimmed and scaled to
 * 320px so small icons do not pull the full-size illustration.
 *
 * Call sites may still pass a `mood` prop. It is intentionally ignored — the
 * artwork is a fixed image and cannot change expression the way the previous
 * inline SVG could.
 */
export function Mascot({ size = 64, className = '', alt = '' }) {
  return (
    <img
      src={capybara}
      width={size}
      height={size}
      className={`mascot${className ? ` ${className}` : ''}`}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable="false"
    />
  )
}

/** Wordmark used in the top bar and on the auth screens. */
export function Logo({ size = 28 }) {
  return (
    <span className="logo">
      <Mascot size={size} />
      <span className="logo-text">Novi</span>
    </span>
  )
}
