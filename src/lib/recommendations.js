import { supabase } from './supabase'
import { friendlyError } from './errors'

/**
 * Personalised recommendations (the `recommend` Edge Function) and what the
 * student does with them (recommendation_events).
 *
 * The function reuses its last batch while nothing has changed, so calling it
 * on every Home visit is cheap. Events are written straight to the table
 * under RLS; each kind is recorded once per recommendation (a unique key), so
 * re-renders and double clicks can't inflate them.
 */

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export async function fetchRecommendations() {
  const { data, error } = await supabase.functions.invoke('recommend', { body: { tz: timeZone() } })
  if (error) throw new Error(friendlyError(error, 'Recommendations could not be loaded.'))
  return data?.recommendations ?? []
}

/** Where a recommendation's button goes, carrying its id so practice can report back. */
export function recommendationHref(rec) {
  if (rec.action?.type !== 'link' || typeof rec.action.path !== 'string') return null
  const url = new URL(rec.action.path, 'https://novi.invalid')
  url.searchParams.set('rec', rec.id)
  return `${url.pathname}${url.search}`
}

/**
 * Records `event` (shown | opened | dismissed | started | completed) once.
 * Best effort: losing an event must never get in the student's way.
 */
export async function recordRecommendationEvent(recommendationId, event, { sessionId = null, detail = {} } = {}) {
  if (!recommendationId) return
  try {
    const { error } = await supabase
      .from('recommendation_events')
      .upsert(
        { recommendation_id: recommendationId, event, session_id: sessionId, detail },
        { onConflict: 'recommendation_id,event', ignoreDuplicates: true },
      )
    if (error) throw error
    const status = { opened: 'accepted', dismissed: 'dismissed', completed: 'completed' }[event]
    if (status) {
      await supabase.from('recommendations').update({ status }).eq('id', recommendationId)
    }
  } catch (err) {
    console.warn('Recommendation event not recorded:', err?.message ?? err)
  }
}

/** The recommendation id a page was opened from (?rec=), if it's a well-formed one. */
export function recommendationFromSearch(search) {
  const id = new URLSearchParams(search).get('rec')
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}
