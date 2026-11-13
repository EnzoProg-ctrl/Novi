import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/auth-context'
import { supabase } from '../../lib/supabase'
import { Head } from './AccountCards'

/**
 * Two-step verification with an authenticator app (TOTP: Google
 * Authenticator, Microsoft Authenticator, 1Password, …).
 *
 * Once on, signing in needs a code from the app as well as the password, and
 * the database only returns the student's data to sessions that entered one.
 */
export function TwoStepCard({ notify }) {
  const { refreshAssurance } = useAuth()
  // loading | off | setup | on | confirm-off | unavailable
  const [phase, setPhase] = useState('loading')
  const [factorId, setFactorId] = useState(null)
  const [setup, setSetup] = useState(null) // { qr, secret }
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const codeRef = useRef(null)

  const load = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      console.warn('Could not read two-step status:', listError)
      setPhase('unavailable')
      return
    }
    const verified = data?.totp?.find((f) => f.status === 'verified')
    setFactorId(verified?.id ?? null)
    setPhase(verified ? 'on' : 'off')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (phase === 'setup') codeRef.current?.focus()
  }, [phase])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      // A set-up abandoned earlier leaves an unverified factor behind; clear it.
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const f of existing?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      })
      if (enrollError) throw enrollError
      setFactorId(data.id)
      setSetup({ qr: data.totp.qr_code, secret: data.totp.secret })
      setCode('')
      setPhase('setup')
    } catch (err) {
      console.warn('Two-step set-up failed:', err)
      setError("Two-step verification couldn't be set up right now. Try again later.")
    } finally {
      setBusy(false)
    }
  }

  async function confirm(event) {
    event.preventDefault()
    const clean = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(clean)) {
      setError('Enter the 6-digit code your app shows for Novi.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean })
      if (verifyError) throw verifyError
      await refreshAssurance()
      setSetup(null)
      setPhase('on')
      notify('Two-step verification is on')
    } catch {
      setCode('')
      setError("That code didn't match. Use the newest code in your app and try again.")
      codeRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function cancelSetup() {
    setBusy(true)
    try {
      if (factorId) await supabase.auth.mfa.unenroll({ factorId })
    } catch {
      /* an unverified factor does nothing; it is cleared next time anyway */
    }
    setSetup(null)
    setFactorId(null)
    setError(null)
    setPhase('off')
    setBusy(false)
  }

  async function turnOff() {
    setBusy(true)
    setError(null)
    try {
      const { error: offError } = await supabase.auth.mfa.unenroll({ factorId })
      if (offError) throw offError
      await supabase.auth.refreshSession()
      await refreshAssurance()
      setFactorId(null)
      setPhase('off')
      notify('Two-step verification is off')
    } catch (err) {
      console.warn('Turning off two-step failed:', err)
      setError("Two-step verification couldn't be turned off. Sign out and back in, then try again.")
      setPhase('on')
    } finally {
      setBusy(false)
    }
  }

  const grouped = setup?.secret?.match(/.{1,4}/g)?.join(' ') ?? ''

  return (
    <section className="hm-card st-card" aria-labelledby="st-2fa-title">
      <Head id="st-2fa-title" title="Two-step verification" sub="Protect your account with a code from your phone." />

      {phase === 'loading' && <p className="st-row-help">Checking…</p>}

      {phase === 'unavailable' && (
        <p className="st-row-help">Two-step verification isn&rsquo;t available right now.</p>
      )}

      {(phase === 'off' || phase === 'on' || phase === 'confirm-off') && (
        <div className="st-action">
          <span className="st-action-text">
            <span className="st-row-label">
              Authenticator app{' '}
              <span className={`st-2fa-state${phase === 'off' ? '' : ' is-on'}`}>{phase === 'off' ? 'Off' : 'On'}</span>
            </span>
            <span className="st-row-help">
              {phase === 'off'
                ? 'When you sign in, also enter a code from an app like Google Authenticator.'
                : 'Signing in asks for a code from your authenticator app.'}
            </span>
          </span>
          {phase === 'off' && (
            <button type="button" className="btn btn-secondary st-action-btn" onClick={start} disabled={busy}>
              {busy ? 'Starting…' : 'Set up'}
            </button>
          )}
          {phase === 'on' && (
            <button type="button" className="btn btn-secondary st-action-btn" onClick={() => setPhase('confirm-off')}>
              Turn off
            </button>
          )}
        </div>
      )}

      {phase === 'confirm-off' && (
        <div className="st-2fa-confirm" role="group" aria-label="Turn off two-step verification">
          <p className="st-row-help">Without it, your password alone is enough to sign in. Turn it off?</p>
          <div className="st-2fa-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPhase('on')} disabled={busy}>Keep it on</button>
            <button type="button" className="btn st-btn-danger" onClick={turnOff} disabled={busy}>
              {busy ? 'Turning off…' : 'Turn off'}
            </button>
          </div>
        </div>
      )}

      {phase === 'setup' && setup && (
        <form className="st-2fa-setup" onSubmit={confirm} noValidate>
          <ol className="st-2fa-steps">
            <li>Open your authenticator app and add an account.</li>
            <li>Scan this code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows for Novi.</li>
          </ol>
          <img className="st-2fa-qr" src={setup.qr} width={168} height={168} alt="QR code to add Novi to your authenticator app" />
          <p className="st-row-help">
            Key: <code className="st-2fa-secret">{grouped}</code>
          </p>
          <div className="field">
            <label className="label" htmlFor="st-2fa-code">Code from the app</label>
            <input
              ref={codeRef}
              id="st-2fa-code"
              className="input mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              disabled={busy}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          <div className="st-2fa-actions">
            <button type="button" className="btn btn-secondary" onClick={cancelSetup} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Turn on'}</button>
          </div>
        </form>
      )}

      {error && <p className="st-inline-msg is-error" role="alert">{error}</p>}
    </section>
  )
}
