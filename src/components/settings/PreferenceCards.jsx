import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadingRegion, Sk } from '../Skeleton'
import { Select } from '../Select'

/**
 * Study preferences, notifications and appearance. These save as soon as they
 * change (each one is independent), with a per-setting status beside it. A
 * failed save rolls the control back and says so.
 */

const SESSION_LENGTHS = [
  [25, '25 minutes'],
  [30, '30 minutes'],
  [45, '45 minutes'],
  [60, '1 hour'],
  [90, '90 minutes'],
  [120, '2 hours'],
]
const BREAK_LENGTHS = [5, 10, 15, 20]
const GOAL_OPTIONS = [3, 5, 7, 10, 14]

// "Ask me each time" is stored as null; the dropdown needs a real value for it.
const ASK = 'ask'
const PRACTICE_SIZES = [5, 10, 15, 20]
const QUIZ_SIZES = [5, 10, 20, 30, 50]
const REPLY_LENGTHS = [
  { value: 'short', label: 'Short and to the point' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed explanations' },
]
// Values match the CHECK constraint on profiles.question_types.
const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True or false' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'flashcard', label: 'Flashcards' },
]

/** Tracks "Saving… / Saved / Couldn't save" per setting. */
function useAutosave(onError) {
  const [status, setStatus] = useState({})
  const timers = useRef({})
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const save = useCallback(
    async (key, run) => {
      clearTimeout(timers.current[key])
      setStatus((s) => ({ ...s, [key]: 'saving' }))
      try {
        await run()
        setStatus((s) => ({ ...s, [key]: 'saved' }))
        timers.current[key] = setTimeout(() => setStatus((s) => ({ ...s, [key]: null })), 2200)
      } catch (err) {
        setStatus((s) => ({ ...s, [key]: 'error' }))
        onError?.(err)
      }
    },
    [onError],
  )
  return [status, save]
}

function SaveStatus({ state }) {
  if (!state) return <span className="st-status" aria-hidden="true" />
  const text = { saving: 'Saving…', saved: 'Saved', error: "Couldn't save" }[state]
  return (
    <span className={`st-status is-${state}`} role="status">
      {state === 'saved' && <span aria-hidden="true">✓ </span>}
      {text}
    </span>
  )
}

function CardHead({ id, title, sub }) {
  return (
    <header className="st-card-head">
      <h2 id={id} className="st-card-title">{title}</h2>
      <p className="hm-sub">{sub}</p>
    </header>
  )
}

function PrefsSkeleton({ rows = 4 }) {
  return (
    <LoadingRegion label="Loading your preferences…" className="st-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="st-row">
          <span className="sk-stack" style={{ gap: 7 }}>
            <Sk w="40%" h={13} />
            <Sk w="70%" h={11} />
          </span>
          <Sk w={180} h={42} r={12} />
        </div>
      ))}
    </LoadingRegion>
  )
}

function PrefsError({ onRetry }) {
  return (
    <div className="st-error" role="alert">
      <p>Your preferences could not be loaded.</p>
      <button type="button" className="btn btn-secondary st-retry" onClick={onRetry}>Try again</button>
    </div>
  )
}

/** One labelled setting: label and help on the left, control and status on the right. */
function Row({ id, label, help, status, children }) {
  return (
    <div className="st-row">
      <div className="st-row-text">
        <label id={`${id}-label`} className="st-row-label" htmlFor={id}>{label}</label>
        {help && <p id={`${id}-help`} className="st-row-help">{help}</p>}
      </div>
      <div className="st-row-control">
        {children}
        <SaveStatus state={status} />
      </div>
    </div>
  )
}

// ── Study preferences ───────────────────────────────────────────────

export function StudyPreferences({ prefs, prefsStatus, onRetry, update, goal, goalStatus, onGoalSave, onError }) {
  const [status, save] = useAutosave(onError)
  const loading = prefsStatus === 'loading' || goalStatus === 'loading'
  // A goal set elsewhere (the Calendar allows 1-21) still shows as selected.
  const goals = goal && !GOAL_OPTIONS.includes(goal) ? [...GOAL_OPTIONS, goal].sort((a, b) => a - b) : GOAL_OPTIONS

  return (
    <section className="hm-card st-card" aria-labelledby="st-study-title">
      <CardHead id="st-study-title" title="Study Preferences" sub="Set your default preferences for a better study experience." />
      {prefsStatus === 'error' || goalStatus === 'error' ? (
        <PrefsError onRetry={onRetry} />
      ) : loading ? (
        <PrefsSkeleton />
      ) : (
        <div className="st-rows">
          <h3 className="st-subhead">Studying</h3>

          <Row id="st-practice-size" label="Practice session length" help="How many questions a practice session has. Choose a number to skip the question at the start." status={status.practice}>
            <Select
              id="st-practice-size"
              className="input st-select"
              labelledBy="st-practice-size-label"
              describedBy="st-practice-size-help"
              value={prefs.practiceSessionSize ?? ASK}
              onChange={(v) => save('practice', () => update({ practiceSessionSize: v === ASK ? null : v }))}
              options={[{ value: ASK, label: 'Ask me each time' }, ...PRACTICE_SIZES.map((n) => ({ value: n, label: `${n} questions` }))]}
            />
          </Row>

          <Row id="st-quiz-size" label="AI Chat quiz size" help="Used when you ask for a practice quiz without saying how many questions." status={status.quiz}>
            <Select
              id="st-quiz-size"
              className="input st-select"
              labelledBy="st-quiz-size-label"
              describedBy="st-quiz-size-help"
              value={prefs.chatQuizSize ?? ASK}
              onChange={(v) => save('quiz', () => update({ chatQuizSize: v === ASK ? null : v }))}
              options={[{ value: ASK, label: 'Ask me each time' }, ...QUIZ_SIZES.map((n) => ({ value: n, label: `${n} questions` }))]}
            />
          </Row>

          <Row id="st-reply-length" label="Buddy reply length" help="How much your buddy writes in AI Chat." status={status.reply}>
            <Select
              id="st-reply-length"
              className="input st-select"
              labelledBy="st-reply-length-label"
              describedBy="st-reply-length-help"
              value={prefs.replyLength}
              onChange={(v) => save('reply', () => update({ replyLength: v }))}
              options={REPLY_LENGTHS}
            />
          </Row>

          <QuestionTypesRow
            value={prefs.questionTypes}
            status={status.types}
            onChange={(next) => save('types', () => update({ questionTypes: next }))}
          />

          <h3 className="st-subhead">Planning</h3>

          <Row id="st-session-length" label="Default session duration" help="How long a new planned session is, unless you change it." status={status.session}>
            <Select
              id="st-session-length"
              className="input st-select"
              labelledBy="st-session-length-label"
              describedBy="st-session-length-help"
              value={prefs.defaultSessionMinutes}
              onChange={(v) => save('session', () => update({ defaultSessionMinutes: v }))}
              options={SESSION_LENGTHS.map(([v, label]) => ({ value: v, label }))}
            />
          </Row>

          <Row id="st-goal" label="Weekly study goal" help="Planned sessions to complete each week. The Calendar and Progress pages use this too." status={status.goal}>
            <Select
              id="st-goal"
              className="input st-select"
              labelledBy="st-goal-label"
              describedBy="st-goal-help"
              value={goal ?? 5}
              onChange={(v) => save('goal', () => onGoalSave(v))}
              options={goals.map((n) => ({ value: n, label: `${n} ${n === 1 ? 'session' : 'sessions'}` }))}
            />
          </Row>

          <Row id="st-break" label="Default break length" help="How long a new session is when you plan a Break in the Calendar." status={status.break}>
            <Select
              id="st-break"
              className="input st-select"
              labelledBy="st-break-label"
              describedBy="st-break-help"
              value={prefs.defaultBreakMinutes}
              onChange={(v) => save('break', () => update({ defaultBreakMinutes: v }))}
              options={BREAK_LENGTHS.map((n) => ({ value: n, label: `${n} minutes` }))}
            />
          </Row>

          <Row id="st-week" label="Start of week" help="Used by the Calendar, your weekly goal and Progress." status={status.week}>
            <Select
              id="st-week"
              className="input st-select"
              labelledBy="st-week-label"
              describedBy="st-week-help"
              value={prefs.weekStartsOn}
              onChange={(v) => save('week', () => update({ weekStartsOn: v }))}
              options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]}
            />
          </Row>
        </div>
      )}
    </section>
  )
}

/**
 * Which question types new practice questions use (new packs and AI Chat
 * quizzes). At least one stays selected: the last one can't be unticked.
 */
function QuestionTypesRow({ value, status, onChange }) {
  const selected = new Set(value)
  const toggle = (type) => {
    const next = new Set(selected)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    // Keep the canonical order so saves are stable.
    onChange(QUESTION_TYPES.map((t) => t.value).filter((t) => next.has(t)))
  }
  return (
    <div className="st-row st-row-wide" role="group" aria-labelledby="st-types-label" aria-describedby="st-types-help">
      <div className="st-row-text">
        <span id="st-types-label" className="st-row-label">Question types</span>
        <p id="st-types-help" className="st-row-help">
          What new practice questions can be, in new study packs and AI Chat quizzes. Keep at least one.
        </p>
      </div>
      <div className="st-row-control st-chips-control">
        <div className="st-chips">
          {QUESTION_TYPES.map((t) => {
            const on = selected.has(t.value)
            const last = on && selected.size === 1
            return (
              <label key={t.value} className={`st-chip${on ? ' is-on' : ''}${last ? ' is-locked' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={last}
                  onChange={() => toggle(t.value)}
                  title={last ? 'Keep at least one question type' : undefined}
                />
                <span>{t.label}</span>
              </label>
            )
          })}
        </div>
        <SaveStatus state={status} />
      </div>
    </div>
  )
}

// ── Notifications ───────────────────────────────────────────────────

function Switch({ id, checked, disabled, onChange, labelledBy, describedBy }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      className={`st-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="st-switch-thumb" aria-hidden="true" />
      <span className="st-switch-text" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
    </button>
  )
}

const NOTIFICATIONS = [
  {
    key: 'notifySessionReminders',
    label: 'Session reminders',
    help: 'Get a reminder 10 minutes before a planned study session starts.',
  },
  {
    key: 'notifyWeeklyGoal',
    label: 'Weekly goal updates',
    help: 'Get a message when you complete the session that reaches your weekly goal.',
  },
]

export function NotificationSettings({ prefs, prefsStatus, onRetry, update, onError }) {
  const [status, save] = useAutosave(onError)

  return (
    <section className="hm-card st-card" aria-labelledby="st-notify-title">
      <CardHead id="st-notify-title" title="Notifications" sub="Choose what you want to be notified about." />
      {prefsStatus === 'error' ? (
        <PrefsError onRetry={onRetry} />
      ) : prefsStatus === 'loading' ? (
        <PrefsSkeleton rows={2} />
      ) : (
        <>
          <div className="st-rows">
            {NOTIFICATIONS.map(({ key, label, help }) => (
              <div key={key} className="st-row">
                <div className="st-row-text">
                  <p id={`st-${key}-label`} className="st-row-label">{label}</p>
                  <p id={`st-${key}-help`} className="st-row-help">{help}</p>
                </div>
                <div className="st-row-control">
                  <Switch
                    id={`st-${key}`}
                    checked={prefs[key]}
                    disabled={status[key] === 'saving'}
                    labelledBy={`st-${key}-label`}
                    describedBy={`st-${key}-help`}
                    onChange={(next) => save(key, () => update({ [key]: next }))}
                  />
                  <SaveStatus state={status[key]} />
                </div>
              </div>
            ))}
          </div>
          <p className="st-note">
            Novi shows these inside the app while it&apos;s open in a browser tab. It doesn&apos;t send
            emails or push notifications yet.
          </p>
        </>
      )}
    </section>
  )
}

// ── Appearance ──────────────────────────────────────────────────────

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]
const ACCENTS = [
  { value: 'coral', label: 'Coral', color: '#ff6b5a' },
  { value: 'lavender', label: 'Lavender', color: '#8a6fe6' },
  { value: 'blue', label: 'Blue', color: '#4a7ef0' },
  { value: 'mint', label: 'Mint', color: '#1fa487' },
  { value: 'rose', label: 'Rose', color: '#e65f8b' },
]
const FONT_SIZES = [
  { value: 'small', label: 'Small', sample: 'Aa' },
  { value: 'medium', label: 'Medium', sample: 'Aa' },
  { value: 'large', label: 'Large', sample: 'Aa' },
]

/** A labelled radio group drawn as tiles. */
function Choice({ name, legend, help, options, value, onChange, status, render }) {
  return (
    <fieldset className="st-choice">
      <div className="st-choice-head">
        <legend className="st-row-label">{legend}</legend>
        <SaveStatus state={status} />
      </div>
      {help && <p className="st-row-help">{help}</p>}
      <div className={`st-tiles st-tiles-${name}`}>
        {options.map((opt) => (
          <label key={opt.value} className={`st-tile${value === opt.value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={`st-${name}`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {render(opt, value === opt.value)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function AppearanceSettings({ prefs, prefsStatus, onRetry, update, onError }) {
  const [status, save] = useAutosave(onError)

  return (
    <section className="hm-card st-card" aria-labelledby="st-look-title">
      <CardHead id="st-look-title" title="Appearance" sub="Customize how Novi looks and feels." />
      {prefsStatus === 'error' ? (
        <PrefsError onRetry={onRetry} />
      ) : prefsStatus === 'loading' ? (
        <PrefsSkeleton rows={3} />
      ) : (
        <div className="st-choices">
          <Choice
            name="theme"
            legend="Theme"
            help="System follows your device's light or dark setting."
            options={THEMES}
            value={prefs.theme}
            status={status.theme}
            onChange={(theme) => save('theme', () => update({ theme }))}
            render={(opt, selected) => (
              <>
                <span className={`st-theme-preview is-${opt.value}`} aria-hidden="true">
                  <span /><span /><span />
                </span>
                <span className="st-tile-label">
                  {selected && <span className="st-check" aria-hidden="true">✓</span>}
                  {opt.label}
                </span>
              </>
            )}
          />

          <Choice
            name="accent"
            legend="Accent color"
            help="Used for buttons, highlights and the active page in the sidebar."
            options={ACCENTS}
            value={prefs.accent}
            status={status.accent}
            onChange={(accent) => save('accent', () => update({ accent }))}
            render={(opt, selected) => (
              <>
                <span className="st-swatch" style={{ background: opt.color }} aria-hidden="true">
                  {selected && '✓'}
                </span>
                <span className="st-tile-label">{opt.label}</span>
              </>
            )}
          />

          <Choice
            name="font"
            legend="Font size"
            options={FONT_SIZES}
            value={prefs.fontScale}
            status={status.font}
            onChange={(fontScale) => save('font', () => update({ fontScale }))}
            render={(opt, selected) => (
              <>
                <span className={`st-font-sample is-${opt.value}`} aria-hidden="true">{opt.sample}</span>
                <span className="st-tile-label">
                  {selected && <span className="st-check" aria-hidden="true">✓</span>}
                  {opt.label}
                </span>
              </>
            )}
          />
        </div>
      )}
    </section>
  )
}
