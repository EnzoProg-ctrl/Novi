import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches right now, kept up to date. */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** The phone layout (app-shell.css): bottom tab bar, single-column Home. */
export const PHONE_QUERY = '(max-width: 767px)'
