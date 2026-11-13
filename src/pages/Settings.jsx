import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '../components/home/home.css'
import { Modal } from '../components/Modal'
import { AccountCard, DangerZone, DataPrivacyCard } from '../components/settings/AccountCards'
import { DeleteForm, EmailForm, PasswordForm } from '../components/settings/AccountForms'
import { EmailChangeNotice } from '../components/settings/EmailChangeNotice'
import { AppearanceSettings, NotificationSettings, StudyPreferences } from '../components/settings/PreferenceCards'
import { ProfileCard, ProfilePreview } from '../components/settings/ProfileSettings'
import { TwoStepCard } from '../components/settings/TwoStepCard'
import '../components/settings/settings.css'
import '../components/study/packs-page.css'
import { useAuth } from '../context/auth-context'
import { usePreferences } from '../context/preferences-context'
import { changePassword, deleteAccount, downloadMyData, requestEmailChange, updateDisplayName } from '../lib/account'
import { peekAuthRedirectNotice, takeAuthRedirectNotice } from '../lib/auth-redirect'
import { fetchWeeklyGoal, saveWeeklyGoal } from '../lib/schedule'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'study', label: 'Study Preferences' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Data & Privacy' },
]

export function Settings() {
  const { user, buddy, signOut, refreshUser } = useAuth()
  const { prefs, status: prefsStatus, reload, updatePreferences } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()

  // The open tab lives in the URL hash, so a refresh or a shared link keeps it.
  const fromHash = location.hash.slice(1)
  const tab = TABS.some((t) => t.id === fromHash) ? fromHash : 'profile'
  const tabRefs = useRef({})

  // On narrow screens the tab strip scrolls sideways; keep the selected tab in view.
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  const [goal, setGoal] = useState(null)
  const [goalStatus, setGoalStatus] = useState('loading')
  const [modal, setModal] = useState(null) // { open, kind: 'email' | 'password' | 'delete' }
  const [locked, setLocked] = useState(false)
  const [toast, setToast] = useState(null)
  // What an email-change link reported when it opened Novi (see lib/auth-redirect).
  // Password reset links are handled on /reset-password, not here.
  const [linkNotice, setLinkNotice] = useState(() => {
    const notice = peekAuthRedirectNotice()
    return notice?.kind === 'recovery' ? null : notice
  })
  useEffect(() => {
    takeAuthRedirectNotice()
  }, [])

  // While an email change waits for its links, the copy of the account in this
  // tab goes stale as soon as a link is clicked in an inbox. Re-check on
  // opening Settings and whenever the student comes back to the tab.
  const emailPending = Boolean(user?.new_email)
  useEffect(() => {
    if (!emailPending) return
    refreshUser()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUser()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [emailPending, refreshUser])
  const toastTimer = useRef(null)

  const notify = useCallback((text, tone = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ text, tone, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const onSaveError = useCallback(() => notify("That change couldn't be saved. It's been put back.", 'error'), [notify])

  // The weekly goal is the one the Calendar and Progress use (learning_profile).
  const loadGoal = useCallback(async () => {
    if (!user) return
    setGoalStatus('loading')
    try {
      setGoal(await fetchWeeklyGoal(user.id))
      setGoalStatus('ready')
    } catch {
      setGoalStatus('error')
    }
  }, [user])
  useEffect(() => {
    loadGoal()
  }, [loadGoal])

  async function saveGoal(next) {
    const before = goal
    setGoal(next)
    try {
      setGoal(await saveWeeklyGoal(user.id, next))
    } catch (err) {
      setGoal(before)
      throw err
    }
  }

  function selectTab(id, focus = false) {
    navigate({ hash: id === 'profile' ? '' : id }, { replace: true })
    if (focus) tabRefs.current[id]?.focus()
  }

  // Arrow keys move between tabs, as the WAI-ARIA tabs pattern expects.
  function onTabKey(event) {
    const i = TABS.findIndex((t) => t.id === tab)
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (step) {
      event.preventDefault()
      selectTab(TABS[(i + step + TABS.length) % TABS.length].id, true)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      selectTab(TABS[event.key === 'Home' ? 0 : TABS.length - 1].id, true)
    }
  }

  const open = (kind) => setModal({ open: true, kind })
  const close = () => setModal((m) => (m ? { ...m, open: false } : m))

  // Only what changed is saved: the name (auth metadata and profiles) and the
  // school details (profiles, through the preferences provider).
  async function handleProfile({ name, details }) {
    try {
      if (name !== (user?.user_metadata?.display_name ?? '')) await updateDisplayName(user.id, name)
      const changed = Object.fromEntries(Object.entries(details).filter(([key, value]) => prefs[key] !== value))
      if (Object.keys(changed).length) await updatePreferences(changed)
      notify('Profile updated')
    } catch (err) {
      notify('Your profile could not be saved. Try again.', 'error')
      throw err
    }
  }

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      notify('You could not be signed out. Try again.', 'error')
    }
  }

  async function handleDownload() {
    try {
      return await downloadMyData(user)
    } catch (err) {
      notify('The export could not be prepared.', 'error')
      throw err
    }
  }

  async function handlePassword(current, next) {
    setLocked(true)
    try {
      await changePassword(user.email, current, next)
      close()
      notify('Password changed')
    } finally {
      setLocked(false)
    }
  }

  async function handleDelete(password) {
    setLocked(true)
    try {
      await deleteAccount(password)
    } catch (err) {
      setLocked(false)
      throw err
    }
    // The account is gone; clear the now-invalid local session too.
    try {
      await signOut()
    } catch {
      /* the server no longer knows this session either way */
    }
    navigate('/signin', { replace: true, state: { notice: 'Your account and all of its data were deleted.' } })
  }

  const prefProps = { prefs, prefsStatus, onRetry: reload, update: updatePreferences, onError: onSaveError }

  return (
    <div className="pk st">
      <header className="pk-head">
        <div>
          <h1 className="pk-title">Settings</h1>
          <p className="hm-sub">Customize your Novi experience.</p>
        </div>
      </header>

      {linkNotice && (
        <EmailChangeNotice
          notice={linkNotice}
          user={user}
          onResend={requestEmailChange}
          onDismiss={() => setLinkNotice(null)}
        />
      )}

      <div className="st-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => (tabRefs.current[t.id] = el)}
            id={`st-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="st-panel"
            tabIndex={tab === t.id ? 0 : -1}
            className={`st-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="st-layout">
        <div id="st-panel" role="tabpanel" aria-labelledby={`st-tab-${tab}`} className="st-main" tabIndex={-1}>
          {tab === 'profile' && (
            <ProfileCard
              user={user}
              details={prefs}
              detailsReady={prefsStatus === 'ready'}
              onSave={handleProfile}
              onChangeEmail={() => open('email')}
            />
          )}
          {tab === 'study' && (
            <StudyPreferences
              {...prefProps}
              onRetry={() => {
                reload()
                loadGoal()
              }}
              goal={goal}
              goalStatus={goalStatus}
              onGoalSave={saveGoal}
            />
          )}
          {tab === 'notifications' && <NotificationSettings {...prefProps} />}
          {tab === 'appearance' && <AppearanceSettings {...prefProps} />}
          {tab === 'privacy' && <DataPrivacyCard onDownload={handleDownload} />}
        </div>

        <aside className="st-side" aria-label="Your account">
          <ProfilePreview user={user} buddy={buddy} details={prefs} />
          <AccountCard
            user={user}
            onChangeEmail={() => open('email')}
            onChangePassword={() => open('password')}
            onSignOut={handleSignOut}
          />
          <TwoStepCard notify={notify} />
          <DangerZone onDelete={() => open('delete')} />
        </aside>
      </div>

      <Modal
        open={Boolean(modal?.open)}
        onRequestClose={close}
        onClosed={() => setModal(null)}
        locked={locked}
        labelledBy="st-modal-title"
      >
        {modal?.kind === 'email' && (
          <EmailForm currentEmail={user?.email} onCancel={close} onSubmit={requestEmailChange} />
        )}
        {modal?.kind === 'password' && <PasswordForm onCancel={close} onSubmit={handlePassword} />}
        {modal?.kind === 'delete' && <DeleteForm onCancel={close} onSubmit={handleDelete} />}
      </Modal>

      {toast && (
        <div key={toast.id} className={`nv-toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
