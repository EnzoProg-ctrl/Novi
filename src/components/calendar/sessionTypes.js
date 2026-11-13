import { formatFullDay, formatTime } from '../../lib/calendar-dates'
import { IconBreak, IconFocus, IconPractice, IconRevision } from './SessionTypeIcons'

/**
 * The four kinds of planned session. Values match the session_type CHECK
 * constraint on scheduled_sessions. Each kind has a colour *and* a glyph, so
 * the calendar never relies on colour alone to tell them apart.
 */
export const SESSION_TYPES = [
  { value: 'focus', label: 'Focus study', tone: 'blue', Icon: IconFocus },
  { value: 'practice', label: 'Practice questions', tone: 'violet', Icon: IconPractice },
  { value: 'revision', label: 'Revision', tone: 'green', Icon: IconRevision },
  { value: 'break', label: 'Break', tone: 'coral', Icon: IconBreak },
]

const BY_VALUE = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t]))

export const typeOf = (session) => BY_VALUE[session?.type] ?? SESSION_TYPES[0]

/** Spoken description of a session, so nothing depends on colour or layout. */
export function describeSession(session) {
  const type = typeOf(session)
  return [
    session.title,
    type.label,
    `${formatFullDay(session.start)}, ${formatTime(session.start)} to ${formatTime(session.end)}`,
    session.packTitle && `Study pack: ${session.packTitle}`,
    session.completedAt ? 'Completed' : null,
  ]
    .filter(Boolean)
    .join('. ')
}
