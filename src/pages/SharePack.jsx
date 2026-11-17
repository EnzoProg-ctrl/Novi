import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconPackBook } from '../components/home/HomeIcons'
import { LoadingRegion, Sk, SkText } from '../components/Skeleton'
import { useAuth } from '../context/auth-context'
import { friendlyError } from '../lib/errors'
import { acceptShare, clearPendingShare, previewShare } from '../lib/sharing'
import '../components/home/home.css'
import '../components/study/share-page.css'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * /share/:code: a share link someone sent. Shows who shared which packs,
 * then copies them into this student's Shared with Me. A visitor who isn't
 * signed in is sent to sign in first (ProtectedRoute) and brought back here.
 */
export function SharePack() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, preview: null, error: null })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  // Arrived: whatever brought the student here has done its job.
  useEffect(() => {
    clearPendingShare()
  }, [])

  useEffect(() => {
    let active = true
    previewShare(code)
      .then((preview) => active && setState({ loading: false, preview, error: null }))
      .catch((err) => active && setState({ loading: false, preview: null, error: friendlyError(err, 'This share link could not be opened.') }))
    return () => {
      active = false
    }
  }, [code])

  async function add() {
    setAdding(true)
    setAddError(null)
    try {
      const res = await acceptShare(code)
      const first = res.added?.[0]?.id
      navigate(`/packs?tab=shared${first ? `&pack=${first}` : ''}`, { replace: true })
    } catch (err) {
      setAddError(friendlyError(err, 'The packs could not be added. Try again.'))
      setAdding(false)
    }
  }

  if (state.loading) {
    return (
      <LoadingRegion label="Opening the share link…" className="sh">
        <section className="hm-card sh-card">
          <Sk w={52} h={52} r={14} />
          <SkText lines={2} h={16} widths={['70%', '45%']} />
          <SkText lines={3} widths={['90%', '80%', '60%']} />
          <Sk w={180} h={44} r={12} />
        </section>
      </LoadingRegion>
    )
  }

  const { preview, error } = state
  const myName = String(user?.user_metadata?.display_name ?? '').trim()

  if (error || !preview) {
    return (
      <div className="sh">
        <section className="hm-card sh-card">
          <h1 className="sh-title">This link doesn't work</h1>
          <p className="hm-sub">{error ?? 'This share link could not be opened.'} Check you have the whole link, or ask for a new one.</p>
          <Link to="/packs" className="hm-buddy-cta sh-cta">Go to Study Packs</Link>
        </section>
      </div>
    )
  }

  const count = preview.packs.length
  const sender = preview.sender_name
  const expiresOn = new Date(preview.expires_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  let body
  if (preview.own) {
    body = (
      <>
        <h1 className="sh-title">This is your own share link</h1>
        <p className="hm-sub">
          These packs are already in My Packs. Send the link to a classmate and they can add their own copy.
          {preview.expired ? ' It has expired, so make a new one first.' : ` It works until ${expiresOn}.`}
        </p>
        <Link to="/packs" className="hm-buddy-cta sh-cta">Go to Study Packs</Link>
      </>
    )
  } else if (preview.already_added) {
    body = (
      <>
        <h1 className="sh-title">You've already added {count === 1 ? 'this pack' : 'these packs'}</h1>
        <p className="hm-sub">They're in Shared with Me, marked as from {sender}.</p>
        <Link to="/packs?tab=shared" className="hm-buddy-cta sh-cta">Open Shared with Me</Link>
      </>
    )
  } else if (preview.expired) {
    body = (
      <>
        <h1 className="sh-title">This link has expired</h1>
        <p className="hm-sub">Ask {sender} to send you a new one.</p>
        <Link to="/packs" className="hm-buddy-cta sh-cta">Go to Study Packs</Link>
      </>
    )
  } else if (count === 0) {
    body = (
      <>
        <h1 className="sh-title">These packs are no longer available</h1>
        <p className="hm-sub">{sender} may have deleted them. Ask them to share again.</p>
        <Link to="/packs" className="hm-buddy-cta sh-cta">Go to Study Packs</Link>
      </>
    )
  } else {
    body = (
      <>
        <h1 className="sh-title">
          {sender} shared {count === 1 ? 'a study pack' : `${count} study packs`} with you
        </h1>
        <p className="hm-sub">
          Add {count === 1 ? 'it' : 'them'} and you get your own copy in Shared with Me, to read and practise like your own packs.
        </p>
        <ul className="sh-packs">
          {preview.packs.map((p, i) => (
            <li key={i}>
              <strong>{p.title}</strong>
              <span>{plural(p.concepts, 'concept', 'concepts')} · {plural(p.questions, 'question', 'questions')}</span>
            </li>
          ))}
        </ul>
        <p className="hint">
          {sender} will see that {myName ? `${myName} (your display name)` : 'you'} added {count === 1 ? 'it' : 'them'}, never your email.
          The link works until {expiresOn}.
        </p>
        {addError && <div className="msg msg-error" role="alert">{addError}</div>}
        <div className="sh-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={add} disabled={adding}>
            {adding ? 'Adding…' : count === 1 ? 'Add to my packs' : `Add ${count} packs`}
          </button>
          <Link to="/packs" className="btn btn-ghost btn-lg">Not now</Link>
        </div>
      </>
    )
  }

  return (
    <div className="sh">
      <section className="hm-card sh-card">
        <span className="hm-pack-icon is-blue sh-icon"><IconPackBook /></span>
        {body}
      </section>
    </div>
  )
}
