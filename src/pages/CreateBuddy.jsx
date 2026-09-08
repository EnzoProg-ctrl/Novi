import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo, Mascot } from '../components/Mascot'
import { useAuth } from '../context/auth-context'

// Values must match the personality CHECK constraint on public.buddies.
const PERSONALITIES = [
  { value: 'supportive', label: 'Supportive', blurb: 'Patient and encouraging', mood: 'happy' },
  { value: 'cheerful', label: 'Cheerful', blurb: 'Upbeat and warm', mood: 'happy' },
  { value: 'calm', label: 'Calm', blurb: 'Steady and unhurried', mood: 'calm' },
  { value: 'witty', label: 'Witty', blurb: 'Light and a bit playful', mood: 'happy' },
  { value: 'focused', label: 'Focused', blurb: 'Direct, keeps you on task', mood: 'thinking' },
]

export function CreateBuddy() {
  const { buddy, createBuddy } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState(buddy?.name ?? '')
  const [personality, setPersonality] = useState(buddy?.personality ?? 'supportive')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const selected = PERSONALITIES.find((p) => p.value === personality) ?? PERSONALITIES[0]
  const trimmedName = name.trim()

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    if (!trimmedName) {
      setError('Give your buddy a name.')
      return
    }
    if (trimmedName.length > 40) {
      setError('That name is a little long. Keep it under 40 characters.')
      return
    }

    setBusy(true)
    try {
      await createBuddy({ name: trimmedName, personality })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message ?? 'Could not save your buddy.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="card card-pad buddy-card" onSubmit={handleSubmit}>
        <Logo />

        <div className="buddy-preview">
          <div className="buddy-orb">
            <Mascot size={92} mood={selected.mood} />
          </div>
          <h2 className="auth-title">
            {trimmedName ? `Say hello to ${trimmedName}` : 'Meet your buddy'}
          </h2>
          <p className="hint">
            This is who studies with you. Give them a name and pick how they should sound.
          </p>
        </div>

        {error && <div className="msg msg-error auth-gap">{error}</div>}

        <div className="auth-gap">
          <div className="field">
            <label className="label" htmlFor="buddyName">Buddy name</label>
            <input
              id="buddyName"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nova"
              maxLength={40}
              autoFocus
              required
            />
            <span className="hint">You can rename them later.</span>
          </div>
        </div>

        <fieldset className="personality">
          <legend className="label">Personality</legend>
          <div className="personality-grid">
            {PERSONALITIES.map((option) => (
              <label
                key={option.value}
                className={`personality-option${
                  personality === option.value ? ' is-selected' : ''
                }`}
              >
                <input
                  type="radio"
                  name="personality"
                  value={option.value}
                  checked={personality === option.value}
                  onChange={() => setPersonality(option.value)}
                  className="sr-only"
                />
                <span className="personality-label">{option.label}</span>
                <span className="hint">{option.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving...' : buddy ? 'Save changes' : 'Create my buddy'}
        </button>
      </form>
    </div>
  )
}
