import { createContext, useContext } from 'react'

export const PreferencesContext = createContext(null)

/** Used until a student's saved preferences load, and for anything never set. */
export const DEFAULT_PREFERENCES = {
  defaultSessionMinutes: 60,
  defaultBreakMinutes: 10,
  weekStartsOn: 1,
  // null = ask each time.
  practiceSessionSize: null,
  chatQuizSize: null,
  replyLength: 'balanced',
  questionTypes: ['multiple_choice', 'true_false', 'short_answer', 'fill_blank', 'flashcard'],
  // Settings -> Profile. null = not set.
  educationLevel: null,
  school: null,
  course: null,
  notifySessionReminders: true,
  notifyWeeklyGoal: true,
  theme: 'light',
  accent: 'coral',
  fontScale: 'medium',
}

/**
 * The signed-in student's preferences (study defaults, notifications,
 * appearance) and `updatePreferences(patch)`, which saves to the database and
 * rolls back if the save fails.
 */
export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>')
  return ctx
}
