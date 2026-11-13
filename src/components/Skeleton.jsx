/**
 * Skeleton building blocks. Placeholders take the shape of the content they
 * stand in for, so nothing jumps when the real data arrives. Styles live in
 * index.css (.sk) so every page has them.
 *
 * Wrap a page or region in <LoadingRegion> once: it announces that something
 * is loading and hides the decorative blocks from assistive tech.
 */

const size = (v) => (typeof v === 'number' ? `${v}px` : v)

export function Sk({ w = '100%', h = 12, r, className = '', style }) {
  return (
    <span
      className={`sk${className ? ` ${className}` : ''}`}
      style={{ width: size(w), height: size(h), borderRadius: r != null ? size(r) : undefined, ...style }}
    />
  )
}

export function SkCircle({ size: d = 40, className = '' }) {
  return <Sk w={d} h={d} r="50%" className={className} />
}

/** A few lines of text; each line a little shorter than the last. */
export function SkText({ lines = 2, h = 11, widths, gap = 8, className = '' }) {
  return (
    <span className={`sk-text${className ? ` ${className}` : ''}`} style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Sk key={i} h={h} w={widths?.[i] ?? `${Math.max(40, 92 - i * 22)}%`} />
      ))}
    </span>
  )
}

export function LoadingRegion({ label = 'Loading…', className = '', as: Tag = 'div', children }) {
  // The status sits beside the placeholder rather than inside it, so a list
  // placeholder (as="ul") still contains nothing but its items. sr-only is
  // absolutely positioned, so it never takes a grid or flex slot.
  return (
    <>
      <span className="sr-only" role="status">{label}</span>
      <Tag className={className} aria-hidden="true">{children}</Tag>
    </>
  )
}
