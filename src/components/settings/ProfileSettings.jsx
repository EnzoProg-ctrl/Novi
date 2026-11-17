import { useState } from 'react'
import { COURSE_MAX, EDUCATION_LEVELS, educationLabel, NAME_MAX, SCHOOL_MAX, tidyText } from '../../lib/account'
import { initialsFrom } from '../../lib/initials'
import { Select } from '../Select'

export function Avatar({ name, email, size = 'md' }) {
  return (
    <span className={`st-avatar is-${size}`} aria-hidden="true">
      {initialsFrom(name, email)}
    </span>
  )
}

// "Not set" is stored as null; the dropdown needs a real value for it.
const NONE = 'none'
const LEVEL_OPTIONS = [{ value: NONE, label: 'Not set' }, ...EDUCATION_LEVELS]

/** Examples that fit the level, so the field reads as "strand" or "course". */
function coursePlaceholder(level) {
  if (level === 'senior_high') return 'e.g. STEM, ABM, HUMSS'
  if (level === 'college' || level === 'graduate') return 'e.g. BS Nursing'
  if (level === 'junior_high') return 'e.g. Grade 9, Special Science Class'
  return 'e.g. Web development'
}

const notSet = <span className="st-muted">Not set yet</span>

/**
 * Name and school details. Saved explicitly (Edit Profile, then Save Changes),
 * since these are typed out rather than flipped. The email lives under
 * Account & Privacy with the other sign-in details.
 */
export function ProfileCard({ user, details, detailsReady = true, onSave }) {
  const currentName = user?.user_metadata?.display_name ?? ''
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const [levelValue, setLevelValue] = useState(NONE)
  const [school, setSchool] = useState('')
  const [course, setCourse] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setName(currentName)
    setLevelValue(details?.educationLevel ?? NONE)
    setSchool(details?.school ?? '')
    setCourse(details?.course ?? '')
    setErrors({})
    setEditing(true)
  }

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    const clean = tidyText(name)
    const nextSchool = tidyText(school)
    const nextCourse = tidyText(course)

    const problems = {}
    if (!clean) problems.name = 'Enter your name.'
    else if (clean.length > NAME_MAX) problems.name = `Keep it under ${NAME_MAX} characters.`
    if (nextSchool && nextSchool.length > SCHOOL_MAX) problems.school = `Keep it under ${SCHOOL_MAX} characters.`
    if (nextCourse && nextCourse.length > COURSE_MAX) problems.course = `Keep it under ${COURSE_MAX} characters.`
    setErrors(problems)
    if (Object.keys(problems).length) return

    setSaving(true)
    try {
      await onSave({
        name: clean,
        details: { educationLevel: levelValue === NONE ? null : levelValue, school: nextSchool, course: nextCourse },
      })
      setEditing(false)
    } catch {
      // The form keeps what was typed; the page shows the error message.
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (key) =>
    errors[key] ? <span id={`st-${key}-error`} className="st-field-error">{errors[key]}</span> : null
  const errorProps = (key) =>
    errors[key] ? { 'aria-invalid': true, 'aria-describedby': `st-${key}-error` } : {}

  const shownName = currentName || user?.email?.split('@')[0]
  const level = educationLabel(details?.educationLevel)

  return (
    <section className="hm-card st-card" aria-labelledby="st-profile-title">
      <h2 id="st-profile-title" className="st-card-title st-card-title-sm">Personal Information</h2>

      <div className="st-profile-head">
        <Avatar name={editing ? name : currentName} email={user?.email} size="lg" />
        <div className="st-profile-who">
          <p className="st-profile-name">{shownName}</p>
          <p className="hm-sub">{level ?? 'Education level not set'}</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-secondary st-edit" onClick={startEdit} disabled={!detailsReady}>
            Edit Profile
          </button>
        )}
      </div>

      {editing ? (
        <form className="st-profile-form" onSubmit={submit} noValidate>
          <div className="st-field-row">
            <div className="field">
              <label className="label" htmlFor="st-name">Full name</label>
              <input
                id="st-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX + 20}
                autoComplete="name"
                disabled={saving}
                autoFocus
                {...errorProps('name')}
              />
              {fieldError('name')}
            </div>

            <div className="field">
              <span id="st-level-label" className="label">Education level</span>
              <Select
                id="st-level"
                className="input"
                block
                labelledBy="st-level-label"
                describedBy="st-level-help"
                value={levelValue}
                onChange={setLevelValue}
                options={LEVEL_OPTIONS}
                disabled={saving}
              />
              <span id="st-level-help" className="hint">Your buddy explains things at this level in AI Chat.</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="st-school">School <span className="st-muted">(optional)</span></label>
              <input
                id="st-school"
                className="input"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                maxLength={SCHOOL_MAX + 20}
                autoComplete="organization"
                placeholder="e.g. University of the Philippines"
                disabled={saving}
                {...errorProps('school')}
              />
              {fieldError('school')}
            </div>

            <div className="field">
              <label className="label" htmlFor="st-course">Course or strand <span className="st-muted">(optional)</span></label>
              <input
                id="st-course"
                className="input"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                maxLength={COURSE_MAX + 20}
                placeholder={coursePlaceholder(levelValue)}
                disabled={saving}
                {...errorProps('course')}
              />
              {fieldError('course')}
            </div>
          </div>

          <div className="st-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : (
        <dl className="st-facts">
          <div>
            <dt>Full name</dt>
            <dd>{currentName || notSet}</dd>
          </div>
          <div>
            <dt>Education level</dt>
            <dd>{level ?? notSet}</dd>
          </div>
          <div>
            <dt>School</dt>
            <dd>{details?.school || notSet}</dd>
          </div>
          <div>
            <dt>Course or strand</dt>
            <dd>{details?.course || notSet}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
