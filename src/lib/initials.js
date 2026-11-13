/** Up to two initials from a display name, falling back to the email. */
export function initialsFrom(name, email) {
  const source = name?.trim() || email?.split('@')[0] || ''
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
