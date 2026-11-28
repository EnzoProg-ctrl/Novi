import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { MascotRig } from '../components/MascotRig'
import { useAuth } from '../context/auth-context'
import { friendlyError } from '../lib/errors'
import { AVAILABLE_OUTFITS, OUTFITS, usableOutfit } from '../lib/outfits'

// Values must match the personality CHECK constraint on public.buddies.
const PERSONALITIES = [
  { value: 'supportive', label: 'Supportive', blurb: 'Patient and encouraging' },
  { value: 'cheerful', label: 'Cheerful', blurb: 'Upbeat and warm' },
  { value: 'calm', label: 'Calm', blurb: 'Steady and unhurried' },
  { value: 'witty', label: 'Witty', blurb: 'Light and a bit playful' },
  { value: 'focused', label: 'Focused', blurb: 'Direct, keeps you on task' },
]

export function CreateBuddy() {
  const { buddy, createBuddy } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Editing only: leave without saving, back to where they came from (the
   * profile menu or Settings), or Home if this page was opened directly.
   */
  function cancel() {
    if (location.key !== 'default') navigate(-1)
    else navigate('/dashboard', { replace: true })
  }

  const [name, setName] = useState(buddy?.name ?? '')
  const [personality, setPersonality] = useState(buddy?.personality ?? 'supportive')
  const [outfit, setOutfit] = useState(() => usableOutfit(buddy?.mascot_variant))
  const moreOutfits = AVAILABLE_OUTFITS.length < OUTFITS.length
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

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
      await createBuddy({ name: trimmedName, personality, outfit })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(friendlyError(err, 'Could not save your buddy.'))
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="card card-pad buddy-card" onSubmit={handleSubmit}>
        <Logo />

        <div className="buddy-preview">
          {/* Previews the outfit being chosen, before it's saved. */}
          <div className="buddy-orb">
            <MascotRig key={`${personality}-${outfit}`} pose="waving-sm" size={92} outfit={outfit} className="nv-anim-hop-float" />
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

        <fieldset className="personality">
          <legend className="label">Outfit</legend>
          <div className="buddy-outfits">
            {AVAILABLE_OUTFITS.map((option) => (
              <label key={option.id} className={`personality-option buddy-outfit${outfit === option.id ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="outfit"
                  value={option.id}
                  checked={outfit === option.id}
                  onChange={() => setOutfit(option.id)}
                  className="sr-only"
                />
                <MascotRig pose="waving-sm" size={56} outfit={option.id} />
                <span className="personality-label">{option.label}</span>
              </label>
            ))}
          </div>
          {moreOutfits && <span className="hint">More outfits coming soon.</span>}
        </fieldset>

        {buddy ? (
          // Editing an existing buddy: changes can be dropped. A new student
          // has to create one first, so they only get the create button.
          <div className="buddy-actions auth-gap">
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy && <span className="spinner" />}
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        ) : (
          <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? 'Saving...' : 'Create my buddy'}
          </button>
        )}
      </form>
    </div>
  )
}
