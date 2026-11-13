import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export { authErrorMessage } from './errors'

/**
 * Account operations for Settings. Everything goes through Supabase Auth or
 * RLS-scoped queries as the signed-in student; the one privileged operation
 * (deleting the account) runs in the delete-account Edge Function.
 */

export const NAME_MAX = 60
// Match the CHECK constraints on profiles.school and profiles.course.
export const SCHOOL_MAX = 120
export const COURSE_MAX = 80

/** Values match the CHECK constraint on profiles.education_level. */
export const EDUCATION_LEVELS = [
  { value: 'junior_high', label: 'Junior high school' },
  { value: 'senior_high', label: 'Senior high school' },
  { value: 'college', label: 'College' },
  { value: 'graduate', label: 'Graduate school' },
  { value: 'self_learner', label: 'Self-learner' },
  { value: 'other', label: 'Other' },
]

export const educationLabel = (value) => EDUCATION_LEVELS.find((l) => l.value === value)?.label ?? null

/** Trims and collapses spaces; empty becomes null so "not set" is stored as null. */
export const tidyText = (text) => (text ?? '').trim().replace(/\s+/g, ' ') || null
export const PASSWORD_MIN = 8 // the same rule sign-up enforces

/**
 * The name lives in two places: the auth user's metadata (read by the top bar
 * and the Home greeting) and profiles.display_name. Both are updated. The auth
 * update fires USER_UPDATED, so the app's session — and the top bar — refresh
 * on their own.
 */
export async function updateDisplayName(userId, name) {
  const clean = name.trim().replace(/\s+/g, ' ')
  const { error: authError } = await supabase.auth.updateUser({ data: { display_name: clean } })
  if (authError) throw authError
  const { error } = await supabase.from('profiles').update({ display_name: clean }).eq('id', userId)
  if (error) throw error
  return clean
}

/**
 * Starts Supabase's email change flow. Nothing changes until the student
 * follows the confirmation link (with secure email change on, links go to both
 * the old and the new address).
 */
export async function requestEmailChange(email) {
  const { data, error } = await supabase.auth.updateUser(
    { email: email.trim() },
    { emailRedirectTo: `${window.location.origin}/settings` },
  )
  if (error) throw error
  return data.user
}

/**
 * Sends a password reset link. Supabase answers the same way whether or not
 * the address has an account, so this never reveals who has signed up.
 */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

/** Sets a new password for the session a reset link opened. */
export async function setNewPassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/**
 * Checks the current password before setting a new one, so a session left open
 * on a shared computer cannot be used to take over the account.
 */
export async function changePassword(email, currentPassword, newPassword) {
  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (checkError) {
    const err = new Error('Your current password is not correct.')
    err.field = 'current'
    throw err
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

/**
 * Tables included in "Download my data", with the column that ties each row to
 * the student. Embedding vectors (material_chunks) are left out: they are
 * thousands of numbers per paragraph derived from the material text, which is
 * already included.
 */
const EXPORT_TABLES = [
  ['profiles', 'id'],
  ['buddies', 'user_id'],
  ['learning_profile', 'user_id'],
  ['subjects', 'user_id'],
  ['topics', 'user_id'],
  ['materials', 'user_id'],
  ['study_sets', 'user_id'],
  ['summaries', 'user_id'],
  ['key_concepts', 'user_id'],
  ['questions', 'user_id'],
  ['study_sessions', 'user_id'],
  ['question_attempts', 'user_id'],
  ['topic_mastery', 'user_id'],
  ['daily_activity', 'user_id'],
  ['scheduled_sessions', 'user_id'],
  ['chat_conversations', 'user_id'],
  ['chat_messages', 'user_id'],
  ['recommendations', 'user_id'],
  ['learning_insights', 'user_id'],
]

async function allRows(table, column, userId) {
  const rows = []
  const page = 1000 // PostgREST's default maximum per request
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, userId)
      .range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < page) return rows
  }
}

/** Builds the export and starts a download of novi-data-YYYY-MM-DD.json. */
export async function downloadMyData(user) {
  const tables = {}
  for (const [table, column] of EXPORT_TABLES) {
    tables[table] = await allRows(table, column, user.id)
  }

  const exportedAt = new Date()
  const payload = {
    exported_at: exportedAt.toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      display_name: user.user_metadata?.display_name ?? null,
    },
    notes: [
      'Uploaded files themselves are not included; their details are under "materials", and the extracted text is in materials.extracted_text.',
      'Embedding vectors (material_chunks) are not included; they are derived from the extracted text.',
      'Passwords and sign-in tokens are never included.',
    ],
    ...tables,
  }

  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${exportedAt.getFullYear()}-${pad(exportedAt.getMonth() + 1)}-${pad(exportedAt.getDate())}`
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `novi-data-${stamp}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)

  return Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length]))
}

/** Calls the delete-account function. Resolves only once the account is gone. */
export async function deleteAccount(password) {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { password, confirm: 'DELETE' },
  })
  if (error) {
    let message = 'Your account could not be deleted. Try again.'
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        if (body?.error) message = body.error
      } catch {
        /* keep the generic message */
      }
    }
    const err = new Error(message)
    err.status = error.context?.status
    throw err
  }
}
