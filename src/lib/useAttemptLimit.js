import { useEffect, useState } from 'react'

/**
 * A pause after repeated failures on a form (sign-in, two-step code), kept for
 * the browser tab so a reload doesn't reset it.
 *
 * This is a courtesy and a speed bump, not the real protection: Supabase Auth
 * rate-limits sign-ins and code checks on the server, whatever the page does.
 */
export function useAttemptLimit(key, { max = 5, lockMs = 30_000 } = {}) {
  const read = () => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? { failures: 0, until: 0 }
    } catch {
      return { failures: 0, until: 0 }
    }
  }
  const [state, setState] = useState(read)
  const [now, setNow] = useState(() => Date.now())
  const locked = state.until > now

  // Tick while locked, so the countdown and the unlock happen on their own.
  useEffect(() => {
    if (!locked) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [locked])

  const save = (next) => {
    setState(next)
    setNow(Date.now())
    try {
      sessionStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* private mode: the limit still works for this page */
    }
  }

  return {
    locked,
    secondsLeft: Math.max(0, Math.ceil((state.until - now) / 1000)),
    fail: () => {
      const failures = state.failures + 1
      save(failures >= max ? { failures: 0, until: Date.now() + lockMs } : { failures, until: 0 })
    },
    succeed: () => save({ failures: 0, until: 0 }),
  }
}
