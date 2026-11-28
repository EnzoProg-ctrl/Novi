/**
 * Catching mistakes in an email address before an account is made with it.
 *
 *   emailProblem(address)      the address can't be right (shape, Gmail's rules)
 *   emailSuggestion(address)   a likely typo in the domain ("gmial.com")
 *   domainProblem(address)     the domain doesn't exist or can't receive email
 *
 * What this can't do: prove a mailbox exists. Gmail (like every big provider)
 * doesn't let outside apps check that, so the confirmation email Supabase
 * sends stays the real proof. These checks catch the typos before it.
 */

/** Big providers: never looked up, and what typos are compared against. */
const POPULAR = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'yahoo.com.ph',
]
const GMAIL = new Set(['gmail.com', 'googlemail.com'])

const SHAPE = /^[^\s@]+@[^\s@]+$/
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Splits an address into its two parts, with the domain lowercased. */
function parts(address) {
  const clean = String(address ?? '').trim()
  const at = clean.lastIndexOf('@')
  return { clean, local: clean.slice(0, at), domain: clean.slice(at + 1).toLowerCase() }
}

/** How many single-letter edits turn one string into the other (swaps count once). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/** Why the address can't be right, in one sentence, or null. */
export function emailProblem(address) {
  const { clean, local, domain } = parts(address)
  if (!clean) return 'Enter your email address.'
  if (/\s/.test(clean)) return 'Email addresses can’t contain spaces.'
  if (!SHAPE.test(clean)) return 'Enter a full email address, like name@gmail.com.'
  if (local.length > 64) return 'The part before the @ is too long.'
  if (!DOMAIN.test(domain)) {
    return domain.includes('.')
      ? `“${domain}” isn’t a valid email domain. Check the part after the @.`
      : `The part after the @ is missing its ending, like “${domain}.com”.`
  }

  // Gmail's own rules for usernames (the part before any "+tag").
  if (GMAIL.has(domain)) {
    const user = local.toLowerCase().split('+')[0]
    if (/[^a-z0-9.]/.test(user)) return 'Gmail addresses only use letters, numbers and periods before the @.'
    if (user.startsWith('.') || user.endsWith('.') || user.includes('..')) {
      return 'A Gmail address can’t start or end with a period, or have two in a row.'
    }
    const letters = user.replace(/\./g, '').length
    if (letters < 6 || letters > 30) return 'Gmail addresses have 6 to 30 letters or numbers before the @. Check for a typo.'
  }
  return null
}

/** The address with a likely domain typo fixed ("name@gmial.com" -> "name@gmail.com"), or null. */
export function emailSuggestion(address) {
  const { clean, local, domain } = parts(address)
  if (!SHAPE.test(clean) || POPULAR.includes(domain)) return null
  // "gmail" with no ending at all.
  const bare = POPULAR.find((p) => p.split('.')[0] === domain)
  if (bare) return `${local}@${bare}`
  let best = null
  for (const known of POPULAR) {
    const d = distance(domain, known)
    // Two slips allowed for longer domains, one for short ones (fewer false alarms).
    const allowed = known.length >= 9 ? 2 : 1
    if (d > 0 && d <= allowed && (!best || d < best.d)) best = { known, d }
  }
  return best ? `${local}@${best.known}` : null
}

/**
 * Whether the domain can receive email, looked up over public DNS: it must
 * exist and have a mail server (MX) or at least an address. Only the domain
 * is sent, never the whole address. Popular providers are skipped, and if
 * the lookup itself fails the address is let through (the confirmation email
 * still has to arrive).
 */
export async function domainProblem(address) {
  const { domain } = parts(address)
  if (!domain || POPULAR.includes(domain)) return null
  const lookup = async (type) => {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(3500),
    })
    if (!res.ok) throw new Error(`DNS ${res.status}`)
    return res.json()
  }
  try {
    const mx = await lookup('MX')
    if (mx.Status === 3) return `“${domain}” doesn’t exist. Check the part after the @.`
    if ((mx.Answer ?? []).some((a) => a.type === 15)) return null
    const host = await lookup('A')
    if ((host.Answer ?? []).length) return null
    return `“${domain}” can’t receive email. Check the part after the @.`
  } catch {
    return null
  }
}
