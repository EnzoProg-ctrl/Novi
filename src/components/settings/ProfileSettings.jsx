import { useState } from 'react'
import { Link } from 'react-router-dom'
import { COURSE_MAX, EDUCATION_LEVELS, educationLabel, NAME_MAX, SCHOOL_MAX, tidyText } from '../../lib/account'
import { initialsFrom } from '../../lib/initials'
import { MascotRig } from '../MascotRig'
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
 * Name, email and school details. Saved explicitly (Edit, then Save Changes),
 * since these are typed out rather than flipped.
 */
export function ProfileCard({ user, details, detailsReady = true, onSave, onChangeEmail }) {
  const currentName = user?.user_metadata?.display_name ?? ''
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const [level, setLevel] = useState(NONE)
  const [school, setSchool] = useState('')
  const [course, setCourse] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setName(currentName)
    setLevel(details?.educationLevel ?? NONE)
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
        details: { educationLevel: level === NONE ? null : level, school: nextSchool, course: nextCourse },
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

  return (
    <section className="hm-card st-card" aria-labelledby="st-profile-title">
      <header className="st-card-head st-card-head-row">
        <div>
          <h2 id="st-profile-title" className="st-card-title">Profile Information</h2>
          <p className="hm-sub">Manage your account details and personal information.</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-secondary st-edit" onClick={startEdit} disabled={!detailsReady}>
            Edit
          </button>
        )}
      </header>

      <div className="st-profile">
        <Avatar name={editing ? name : currentName} email={user?.email} size="lg" />

        {editing ? (
          <form className="st-profile-form" onSubmit={submit} noValidate>
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
              <span className="label">Email address</span>
              <p className="st-readonly">{user?.email}</p>
              <span className="hint">
                Changing your email needs a confirmation link.{' '}
                <button type="button" className="st-link" onClick={onChangeEmail}>Change email</button>
              </span>
            </div>

            <div className="field">
              <span id="st-level-label" className="label">Education level</span>
              <Select
                id="st-level"
                className="input"
                block
                labelledBy="st-level-label"
                describedBy="st-level-help"
                value={level}
                onChange={setLevel}
                options={LEVEL_OPTIONS}
                disabled={saving}
              />
              <span id="st-level-help" className="hint">
                Your buddy uses your level and course to explain things at the right level in AI Chat.
              </span>
            </div>

            <div className="st-field-row">
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
                  placeholder={coursePlaceholder(level)}
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
              <dt>Email address</dt>
              <dd>
                {user?.email}
                {user?.new_email && (
                  <span className="st-pending">
                    Changing to {user.new_email}. Click the links sent to both addresses to finish.
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Education level</dt>
              <dd>{educationLabel(details?.educationLevel) ?? notSet}</dd>
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
      </div>
    </section>
  )
}

/** How the student appears in Novi, plus a word of encouragement. */
export function ProfilePreview({ user, buddy, details }) {
  const name = user?.user_metadata?.display_name
  const meta = [educationLabel(details?.educationLevel), details?.course].filter(Boolean).join(' · ')
  return (
    <div className="st-preview-group">
      <section className="hm-card st-card" aria-labelledby="st-preview-title">
        <header className="st-card-head">
          <h2 id="st-preview-title" className="st-card-title">Your Profile</h2>
          <p className="hm-sub">This is how you appear in Novi.</p>
        </header>
        <div className="st-preview">
          <Avatar name={name} email={user?.email} size="xl" />
          <p className="st-preview-name">{name || user?.email?.split('@')[0]}</p>
          {meta && <p className="st-preview-meta">{meta}</p>}
          {details?.school && <p className="st-preview-school">{details.school}</p>}
          {buddy && (
            <p className="st-preview-buddy">
              Studying with <strong>{buddy.name}</strong>
              {' · '}
              <Link to="/buddy/new" className="st-link">Edit buddy</Link>
            </p>
          )}
        </div>
      </section>

      <section className="st-cheer" aria-label="A note from Novi">
        <MascotRig pose="front" className="st-cheer-art" />
        <div>
          <p className="st-cheer-line">Keep going!</p>
          <p className="st-cheer-quote">&ldquo;Small steps lead to big results.&rdquo;</p>
        </div>
      </section>
    </div>
  )
}
