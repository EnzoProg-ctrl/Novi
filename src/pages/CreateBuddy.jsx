import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Mascot'
import { MascotRig } from '../components/MascotRig'
import { useAuth } from '../context/auth-context'
import { ACCENTS } from '../lib/accents'
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

  const [name, setName] = useState(buddy?.name ?? '')
  const [personality, setPersonality] = useState(buddy?.personality ?? 'supportive')
  const [outfit, setOutfit] = useState(() => usableOutfit(buddy?.mascot_variant))
  const [colour, setColour] = useState(buddy?.accent_color ?? 'coral')
  const colourValue = ACCENTS.find((a) => a.value === colour)?.color ?? ACCENTS[0].color
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
      await createBuddy({ name: trimmedName, personality, outfit, colour })
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
          {/* Previews the colour and outfit being chosen, before they're saved. */}
          <div className="buddy-orb" style={{ '--buddy': colourValue }}>
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

        <fieldset className="personality">
          <legend className="label">Colour</legend>
          <div className="buddy-colours">
            {ACCENTS.map((option) => (
              <label
                key={option.value}
                className={`buddy-colour${colour === option.value ? ' is-selected' : ''}`}
                title={option.label}
              >
                <input
                  type="radio"
                  name="colour"
                  value={option.value}
                  checked={colour === option.value}
                  onChange={() => setColour(option.value)}
                  className="sr-only"
                />
                <span className="buddy-swatch" style={{ background: option.color }} aria-hidden="true">
                  {colour === option.value && '\u2713'}
                </span>
                <span className="buddy-colour-label">{option.label}</span>
              </label>
            ))}
          </div>
          <span className="hint">Colours your buddy&apos;s corner of the app. Buttons keep the accent from Settings.</span>
        </fieldset>

        <button className="btn btn-primary btn-block auth-gap" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving...' : buddy ? 'Save changes' : 'Create my buddy'}
        </button>
      </form>
    </div>
  )
}
