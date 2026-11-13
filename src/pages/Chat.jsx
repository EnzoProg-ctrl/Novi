import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import '../components/chat/chat.css'
import { IconPanel, IconPlus, IconX } from '../components/chat/ChatIcons'
import { BuddyMessage, NoviAvatar, TypingIndicator, UserMessage } from '../components/chat/ChatMessage'
import { ChatComposer } from '../components/chat/ChatComposer'
import { DeleteDialog, RenameDialog } from '../components/chat/ChatDialogs'
import { ChatList, RecentChats, WaysToHelp } from '../components/chat/ChatSidePanels'
import { FALLBACK_FOLLOW_UPS, STARTERS } from '../components/chat/chatPrompts'
import { MascotRig } from '../components/MascotRig'
import { Modal } from '../components/Modal'
import { LoadingRegion, Sk, SkText } from '../components/Skeleton'
import { useAuth } from '../context/auth-context'
import { useUpload } from '../context/upload-context'
import {
  MAX_MESSAGE_CHARS,
  checkUpload,
  deleteConversation,
  fetchConversation,
  listConversations,
  renameConversation,
  sendChat,
  setFeedback,
} from '../lib/chat'
import { NEW_CHAT, inflight } from '../lib/chatInflight'
import { initialsFrom } from '../lib/initials'
import { deleteMaterials, processMaterial, uploadMaterial, validateFile } from '../lib/materials'
import { fetchPackOptions } from '../lib/schedule'
import { friendlyError } from '../lib/errors'

/** How long after a message, with no reply yet, the page keeps waiting for one. */
const AWAIT_REPLY_MS = 120_000
const POLL_MS = 3000

/**
 * AI Chat.
 *
 * Two states, decided by the conversation itself: with no messages, Novi
 * greets the student in the middle of the card with starter prompts; once a
 * message is sent (or a saved chat is opened), Novi moves to a compact header
 * and the card belongs to the conversation.
 *
 * The URL is the source of truth for which chat is open (/chat or
 * /chat/:conversationId). Every switch bumps `viewToken`; a reply that comes
 * back for a chat that is no longer on screen only refreshes Recent Chats, so
 * messages from different chats can never mix.
 *
 * Sends outlive the page (lib/chatInflight.js): leave mid-reply, come back,
 * and the message is still there with Novi typing until the reply lands.
 */
export function Chat() {
  const { conversationId: routeId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // A question typed into the buddy card on Home, to send as a new chat.
  const askedFromHome = useRef(false)
  const { user, buddy } = useAuth()
  // The name the student gave their buddy in "Edit your buddy".
  const buddyName = buddy?.name?.trim() || 'Novi'
  const { uploads } = useUpload()

  const displayName = user?.user_metadata?.display_name?.trim() || null
  const firstName = displayName?.split(/\s+/)[0] ?? null
  const initials = initialsFrom(displayName, user?.email)

  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [view, setView] = useState(routeId ? 'loading' : 'ready') // loading | ready | missing | error
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null) // { message, retry: 'regenerate' | 'resend', text }
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState(null)
  const [packId, setPackId] = useState(null)
  const [packs, setPacks] = useState({ loading: true, items: [] })
  const [packsKey, setPacksKey] = useState(0)
  // A file attached in the message box: { key, name, size, status, error, material, packId }
  const [attachment, setAttachment] = useState(null)
  const [recent, setRecent] = useState({ loading: true, items: null, error: null })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [allOpen, setAllOpen] = useState(false)
  const [notice, setNotice] = useState(null)
  // Recent Chats management: one ⋯ menu at a time, then a rename or delete pop-up.
  const [menu, setMenu] = useState(null) // { id, listId, anchor }
  const [renaming, setRenaming] = useState(null) // { conversation, open }
  const [removing, setRemoving] = useState(null) // { conversation, open, busy, error }
  // The reply that just replaced "Novi is typing", and how it is revealed.
  const [arrived, setArrived] = useState(null) // { id, mode: 'morph' | 'fade' }

  const viewToken = useRef(0)
  // Set synchronously, so a double click or Enter pressed twice before the
  // next render cannot send the same message twice.
  const inFlight = useRef(false)
  const shownId = useRef(null)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const attachKey = useRef(null)
  // Stops whatever the current view is waiting on (a send from before, or polling).
  const stopWaiting = useRef(() => {})
  // Where focus goes back to when a rename or delete pop-up closes.
  const returnFocus = useRef(null)

  // Replies that arrive after the page has gone must not touch it (or navigate).
  useEffect(() => () => {
    viewToken.current += 1
    stopWaiting.current()
  }, [])

  // ── Recent chats and study packs ───────────────────────────────
  const loadRecent = useCallback(async () => {
    setRecent((r) => ({ ...r, loading: true }))
    try {
      setRecent({ loading: false, items: await listConversations(50), error: null })
    } catch (error) {
      setRecent((r) => ({ loading: false, items: r.items, error }))
    }
  }, [])

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  // Reloaded after an upload or a new quiz pack, so it can be chosen straight away.
  useEffect(() => {
    if (!user) return
    let alive = true
    fetchPackOptions(user.id)
      .then((items) => alive && setPacks({ loading: false, items }))
      .catch(() => alive && setPacks({ loading: false, items: [] }))
    return () => {
      alive = false
    }
  }, [user, uploads, packsKey])

  const upsertRecent = (conv) =>
    setRecent((r) => ({ ...r, items: [conv, ...(r.items ?? []).filter((c) => c.id !== conv.id)] }))

  // ── Typing → reply ────────────────────────────────────────────
  /**
   * Swaps "Novi is typing" for the reply. Where the browser supports view
   * transitions, typing Novi glides and shrinks into the reply's avatar and
   * the pill grows into its bubble; elsewhere the reply fades in. With reduced
   * motion it simply appears. `update` adds the reply; this also ends `busy`.
   */
  const revealReply = (reply, update) => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canMorph = !still && !document.hidden && typeof document.startViewTransition === 'function'
    const apply = () => {
      update()
      setArrived(still || !reply ? null : { id: reply.id, mode: canMorph ? 'morph' : 'fade' })
      inFlight.current = false
      setBusy(false)
    }
    if (!canMorph) {
      apply()
      return
    }
    // Only one element may carry each transition name: drop the last reply's.
    flushSync(() => setArrived(null))
    const root = document.documentElement
    root.classList.add('ch-morphing')
    let applied = false
    const run = () => {
      if (applied) return
      applied = true
      flushSync(apply)
    }
    const transition = document.startViewTransition(run)
    // The swap waits for the browser to draw a frame. If none comes (a
    // backgrounded window, say), show the reply anyway: never hold it hostage.
    const guard = setTimeout(() => {
      transition.skipTransition()
      run()
    }, 600)
    transition.ready.catch(() => {}) // a skipped transition: the reply still shows
    transition.finished.finally(() => {
      clearTimeout(guard)
      root.classList.remove('ch-morphing')
    })
  }

  // ── Picking up a reply that was still on its way ───────────────
  /** Waits for a send from an earlier visit, then shows the saved result. */
  const waitForSend = (key, conversationId, token) => {
    const unsubscribe = inflight.subscribe(async () => {
      const entry = inflight.get(key)
      if (entry?.status === 'pending') {
        // A new chat whose first message is now saved: open it, and wait for
        // the reply there (its entry is also filed under the real id).
        if (!conversationId && entry.conversationId && token === viewToken.current) {
          unsubscribe()
          inflight.drop(NEW_CHAT)
          navigate(`/chat/${entry.conversationId}`, { replace: true })
        }
        return
      }
      unsubscribe()
      if (token !== viewToken.current) return

      // A new chat: now that it exists, open it like any other.
      const id = conversationId ?? entry?.conversationId ?? null
      if (!conversationId && id) {
        inflight.drop(NEW_CHAT)
        navigate(`/chat/${id}`, { replace: true })
        return
      }
      let revealed = false
      if (id) {
        try {
          const fresh = await fetchConversation(id)
          if (token !== viewToken.current) return
          if (fresh) {
            const show = () => {
              setConversation(fresh.conversation)
              setMessages(fresh.messages)
              setPackId(fresh.conversation.studySetId)
            }
            const last = fresh.messages.at(-1)
            if (entry?.status !== 'failed' && last?.role === 'buddy') {
              revealReply(last, show)
              revealed = true
            } else {
              show()
            }
          }
        } catch {
          /* the messages on screen stay; Try again below covers a failed reply */
        }
      } else {
        setMessages([])
      }
      if (!revealed) {
        inFlight.current = false
        setBusy(false)
      }
      if (entry?.status === 'failed') showFailure(entry)
      inflight.clear(key)
    })
    stopWaiting.current = unsubscribe
  }

  /** No record of the send (page reloaded): check the server for the reply. */
  const pollForReply = (id, lastUserMessage, token) => {
    const timer = setInterval(async () => {
      if (token !== viewToken.current) return clearInterval(timer)
      const waitedTooLong = Date.now() - lastUserMessage.createdAt.getTime() > AWAIT_REPLY_MS
      try {
        const fresh = await fetchConversation(id)
        if (token !== viewToken.current) return
        if (fresh && fresh.messages.at(-1)?.role === 'buddy') {
          clearInterval(timer)
          revealReply(fresh.messages.at(-1), () => {
            setMessages(fresh.messages)
            setConversation(fresh.conversation)
            setPackId(fresh.conversation.studySetId)
          })
          return
        }
      } catch {
        /* try again on the next tick */
      }
      if (waitedTooLong) {
        clearInterval(timer)
        inFlight.current = false
        setBusy(false)
        setFailure({ message: "Novi didn't finish answering that one. Try again.", retry: 'regenerate' })
      }
    }, POLL_MS)
    stopWaiting.current = () => clearInterval(timer)
  }

  const showFailure = (entry) => {
    if (entry.saved) {
      setFailure({ message: entry.error, retry: 'regenerate' })
    } else {
      if (entry.message) setDraft((d) => d || entry.message)
      setFailure({ message: entry.error, retry: 'resend', text: entry.message })
    }
  }

  // ── Which conversation is on screen ───────────────────────────
  useEffect(() => {
    // Already showing it: the first message of a new chat just created it.
    if (routeId && routeId === shownId.current) return

    stopWaiting.current()
    stopWaiting.current = () => {}
    viewToken.current += 1
    const token = viewToken.current
    shownId.current = routeId ?? null
    inFlight.current = false
    setFailure(null)
    setBusy(false)
    setArrived(null)
    setHint(null)
    setDraft('')
    setDrawerOpen(false)

    if (!routeId) {
      setConversation(null)
      setMessages([])
      setPackId(null)
      setView('ready')

      // A new chat started on an earlier visit.
      const pending = inflight.get(NEW_CHAT)
      if (pending?.conversationId) {
        inflight.drop(NEW_CHAT)
        navigate(`/chat/${pending.conversationId}`, { replace: true })
      } else if (pending?.status === 'pending') {
        setMessages([{
          id: 'pending-new',
          role: 'user',
          content: pending.message,
          createdAt: new Date(pending.startedAt),
          metadata: pending.attachment ? { attachment: pending.attachment } : {},
          pending: true,
        }])
        inFlight.current = true
        setBusy(true)
        waitForSend(NEW_CHAT, null, token)
      } else if (pending?.status === 'failed') {
        showFailure(pending)
        inflight.clear(NEW_CHAT)
      }
      return
    }

    setView('loading')
    setConversation(null)
    setMessages([])
    fetchConversation(routeId)
      .then((result) => {
        if (token !== viewToken.current) return
        if (!result) {
          setView('missing')
          return
        }
        setConversation(result.conversation)
        setMessages(result.messages)
        setPackId(result.conversation.studySetId)
        setView('ready')

        const entry = inflight.get(routeId)
        if (entry?.status === 'pending') {
          inFlight.current = true
          setBusy(true)
          waitForSend(routeId, routeId, token)
        } else if (entry?.status === 'failed') {
          showFailure(entry)
          inflight.clear(routeId)
        } else if (entry) {
          inflight.clear(routeId)
        } else {
          const last = result.messages.at(-1)
          if (last?.role === 'user' && Date.now() - last.createdAt.getTime() < AWAIT_REPLY_MS) {
            inFlight.current = true
            setBusy(true)
            pollForReply(routeId, last, token)
          }
        }
      })
      .catch(() => {
        if (token === viewToken.current) setView('error')
      })
  }, [routeId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = Boolean(routeId) || messages.length > 0

  /** A quiz goes into a pack; the chat then uses that pack as its context. */
  const followPack = (result) => {
    const quiz = result.reply?.metadata?.quiz
    if (result.conversation.studySetId) setPackId(result.conversation.studySetId)
    if (quiz?.created) setPacksKey((k) => k + 1)
  }

  /** A chat that now exists on the server becomes the one in the URL. */
  const adopt = (conv) => {
    setConversation(conv)
    if (shownId.current !== conv.id) {
      shownId.current = conv.id
      navigate(`/chat/${conv.id}`, { replace: true })
    }
  }

  // Keep the latest message in view as the conversation grows.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && active) el.scrollTop = el.scrollHeight
  }, [messages.length, busy, failure, view, active])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(t)
  }, [notice])

  // ── Attaching a file ──────────────────────────────────────────
  // The file is uploaded and read straight away, without practice questions:
  // the student chooses how many after sending it.
  const onAttach = async (file) => {
    const problem = validateFile(file)
    if (problem) {
      setAttachment({ key: null, name: file.name, size: file.size, status: 'failed', error: problem })
      return
    }
    const key = crypto.randomUUID()
    attachKey.current = key
    setAttachment({ key, name: file.name, size: file.size, status: 'uploading', error: null, material: null })
    try {
      const material = await uploadMaterial({ userId: user.id, file, title: file.name.replace(/\.[^.]+$/, '') })
      if (attachKey.current !== key) {
        // Removed while uploading.
        deleteMaterials([material]).catch(() => {})
        return
      }
      setAttachment((a) => (a?.key === key ? { ...a, status: 'reading', material } : a))
      processMaterial(material.id, { questionCount: 0 }).catch(() => {
        /* the function records its own failures on the material, which the check below picks up */
      })
    } catch (err) {
      setAttachment((a) => (a?.key === key ? { ...a, status: 'failed', error: friendlyError(err, 'Upload failed. Try again.') } : a))
    }
  }

  // Novi can only use the file once it has been read.
  const readingId = attachment?.status === 'reading' ? attachment.material?.id : null
  useEffect(() => {
    if (!readingId) return
    let alive = true
    const check = async () => {
      try {
        const result = await checkUpload(readingId)
        if (!alive || result.status === 'processing') return
        setAttachment((a) => {
          if (a?.material?.id !== readingId) return a
          return result.status === 'ready' && result.pack
            ? { ...a, status: 'ready', packId: result.pack.id }
            : { ...a, status: 'failed', error: result.error ?? 'This file could not be read.' }
        })
      } catch {
        /* a missed check is retried on the next tick */
      }
    }
    check()
    const timer = setInterval(check, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [readingId])

  const removeAttachment = () => {
    const current = attachment
    attachKey.current = null
    setAttachment(null)
    // Not sent, so not wanted: remove the upload and the pack it became.
    if (current?.material) deleteMaterials([current.material]).catch(() => {})
  }

  // ── Sending ────────────────────────────────────────────────────
  const submit = async (text) => {
    const typed = text.trim()
    const file = attachment?.status === 'ready' ? attachment : null
    const fileBusy = attachment && (attachment.status === 'uploading' || attachment.status === 'reading')
    if ((!typed && !file) || fileBusy || inFlight.current || view !== 'ready' || typed.length > MAX_MESSAGE_CHARS) return

    inFlight.current = true
    const token = viewToken.current
    const fileMeta = file ? { title: file.material.title, source_type: file.material.source_type } : null
    const content = typed || `I've attached "${file.material.title}".`
    const temp = {
      id: `local-${crypto.randomUUID()}`,
      role: 'user',
      content,
      createdAt: new Date(),
      metadata: fileMeta ? { attachment: fileMeta } : {},
      pending: true,
    }
    const key = conversation?.id ?? NEW_CHAT
    inflight.start(key, { message: content, attachment: fileMeta })
    // Once a new chat exists, its entry may have moved to the real id (if the
    // student left and came back), so later updates follow it there.
    let savedId = null
    const entryKey = () => (key === NEW_CHAT && savedId && !inflight.get(NEW_CHAT) ? savedId : key)

    /** The message is stored: show it as sent while Novi keeps answering. */
    const onSaved = ({ conversation: conv, userMessage }) => {
      savedId = conv.id
      inflight.settle(key, { conversationId: conv.id, saved: true })
      upsertRecent(conv)
      if (token !== viewToken.current) return
      adopt(conv)
      setMessages((m) => m.map((x) => (x.id === temp.id ? userMessage : x)))
    }

    setMessages((m) => [...m, temp])
    setDraft('')
    setHint(null)
    setFailure(null)
    setBusy(true)
    if (file) {
      attachKey.current = null
      setAttachment(null)
    }

    let revealed = false
    try {
      const result = await sendChat({
        conversationId: conversation?.id ?? null,
        message: typed,
        studySetId: packId,
        materialId: file?.material.id ?? null,
        onSaved,
      })
      inflight.settle(entryKey(), { status: 'done', conversationId: result.conversation.id })
      upsertRecent(result.conversation)
      if (token !== viewToken.current) return
      inflight.clear(entryKey())
      adopt(result.conversation)
      revealed = true
      revealReply(result.reply, () => {
        setMessages((m) => [
          ...m.map((x) => (x.id === temp.id ? result.userMessage ?? { ...x, pending: false } : x)),
          result.reply,
        ])
        followPack(result)
      })
    } catch (err) {
      inflight.settle(entryKey(), {
        status: 'failed',
        conversationId: err.conversation?.id ?? savedId,
        error: err.message,
        saved: Boolean(err.userMessage),
      })
      if (err.conversation) upsertRecent(err.conversation)
      if (token !== viewToken.current) return
      inflight.clear(entryKey())
      if (err.conversation) adopt(err.conversation)
      if (err.userMessage) {
        // Saved, but no reply: keep the message and offer a fresh reply.
        setMessages((m) => m.map((x) => (x.id === temp.id ? err.userMessage : x)))
        setFailure({ message: err.message, retry: 'regenerate' })
      } else {
        // Never reached the server: give the text (and file) back so nothing is lost.
        setMessages((m) => m.filter((x) => x.id !== temp.id))
        setDraft((d) => d || typed)
        if (file) setAttachment((a) => a ?? file)
        setFailure({ message: err.message, retry: 'resend', text: typed })
      }
    } finally {
      // A revealed reply ends `busy` itself, after the typing state is captured.
      if (token === viewToken.current && !revealed) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  // Sent once, as soon as the new-chat screen is ready. The question is then
  // taken out of the history entry, so going back or reloading can't send it
  // again.
  useEffect(() => {
    const ask = location.state?.ask
    if (!ask || askedFromHome.current || routeId || view !== 'ready' || inFlight.current) return
    askedFromHome.current = true
    navigate('/chat', { replace: true, state: null })
    submit(ask)
  }, [location.state, routeId, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const regenerate = async () => {
    if (!conversation || inFlight.current) return
    inFlight.current = true
    const token = viewToken.current
    const key = conversation.id
    inflight.start(key)
    setFailure(null)
    setBusy(true)
    // The server drops the old reply before writing a new one.
    setMessages((m) => (m.at(-1)?.role === 'buddy' ? m.slice(0, -1) : m))
    let revealed = false
    try {
      const result = await sendChat({ conversationId: conversation.id, regenerate: true, studySetId: packId })
      inflight.settle(key, { status: 'done' })
      upsertRecent(result.conversation)
      if (token !== viewToken.current) return
      inflight.clear(key)
      setConversation(result.conversation)
      revealed = true
      revealReply(result.reply, () => setMessages((m) => [...m, result.reply]))
    } catch (err) {
      inflight.settle(key, { status: 'failed', error: err.message, saved: true })
      if (token !== viewToken.current) return
      inflight.clear(key)
      setFailure({ message: err.message, retry: 'regenerate' })
    } finally {
      if (token === viewToken.current && !revealed) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  const retry = () => {
    if (!failure) return
    if (failure.retry === 'regenerate') regenerate()
    else submit(failure.text ?? '')
  }

  const onFeedback = async (message, value) => {
    const before = message.metadata
    const patch = (metadata) =>
      setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, metadata } : x)))
    patch({ ...before, feedback: value })
    try {
      await setFeedback({ ...message, metadata: before }, value)
    } catch {
      patch(before)
      setNotice('Your feedback could not be saved. Try again.')
    }
  }

  // ── Tasks and navigation ──────────────────────────────────────
  const selectedPack = packs.items.find((p) => p.id === packId) ?? null

  const onTask = (task) => {
    const text = task.fill(selectedPack)
    setDraft(text)
    setHint(selectedPack ? null : task.hint ?? null)
    setDrawerOpen(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  const openChat = (id) => {
    setDrawerOpen(false)
    setAllOpen(false)
    navigate(`/chat/${id}`)
  }

  const newChat = () => {
    setDrawerOpen(false)
    // Starting over: an earlier new chat still being answered stays in Recent
    // Chats, but the page should not jump back to it.
    inflight.drop(NEW_CHAT)
    if (routeId) navigate('/chat')
    else if (messages.length) {
      stopWaiting.current()
      viewToken.current += 1
      shownId.current = null
      inFlight.current = false
      setMessages([])
      setConversation(null)
      setFailure(null)
      setBusy(false)
    }
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // ── Rename and delete from Recent Chats ───────────────────────
  const startRename = (conv, anchor) => {
    returnFocus.current = anchor
    setMenu(null)
    setRenaming({ conversation: conv, open: true })
  }

  /** Throws on failure, so the pop-up stays open with what was typed. */
  const saveRename = async (title) => {
    const id = renaming.conversation.id
    const updated = await renameConversation(id, title)
    // One list feeds the panel, the drawer and "See all".
    setRecent((r) => ({ ...r, items: (r.items ?? []).map((c) => (c.id === id ? { ...c, title: updated.title } : c)) }))
    setConversation((c) => (c?.id === id ? { ...c, title: updated.title } : c))
    setRenaming((r) => (r ? { ...r, open: false } : r))
    setNotice('Conversation renamed.')
  }

  const startDelete = (conv, anchor) => {
    returnFocus.current = anchor
    setMenu(null)
    setRemoving({ conversation: conv, open: true, busy: false, error: null })
  }

  const confirmDelete = async () => {
    if (!removing || removing.busy) return
    const id = removing.conversation.id
    setRemoving((d) => ({ ...d, busy: true, error: null }))
    try {
      await deleteConversation(id)
    } catch (err) {
      setRemoving((d) => (d ? { ...d, busy: false, error: err.message } : d))
      return
    }
    // Only now, with the server's confirmation, does it leave the list.
    setRecent((r) => ({ ...r, items: (r.items ?? []).filter((c) => c.id !== id) }))
    inflight.clear(id)
    // A new chat still filed under NEW_CHAT must not reopen the deleted one.
    if (inflight.get(NEW_CHAT)?.conversationId === id) inflight.drop(NEW_CHAT)
    if (conversation?.id === id || routeId === id) {
      // The open chat is gone: back to the welcome state, not its old messages.
      returnFocus.current = null
      setAllOpen(false)
      navigate('/chat', { replace: true })
    }
    setRemoving((d) => (d ? { ...d, open: false, busy: false } : d))
    setNotice('Conversation deleted.')
  }

  /** After a pop-up has closed: back to its ⋯ button, or somewhere close by if the row is gone. */
  const restoreFocus = () => {
    const target = returnFocus.current
    returnFocus.current = null
    if (target?.isConnected) {
      target.focus()
      return
    }
    // Stay in the drawer or "See all" if one is still open (the page behind it
    // can't take focus); otherwise go to the message box.
    const host = [...document.querySelectorAll('dialog[open]:not(.ch-dialog):not(.is-closing)')].pop()
    if (host) {
      ;(host.querySelector('.ch-recent-item') ?? host.querySelector('button'))?.focus()
      return
    }
    // A drawer still animating closed keeps the page inert until it is gone.
    if (document.querySelector('dialog.is-closing')) setTimeout(() => inputRef.current?.focus(), 450)
    else inputRef.current?.focus()
  }

  const lastIndex = messages.length - 1
  const last = messages[lastIndex]
  const followUps =
    last?.role === 'buddy' && !busy && !failure && !last.metadata.ask_quiz_count
      ? last.metadata.follow_ups?.length ? last.metadata.follow_ups : FALLBACK_FOLLOW_UPS
      : []

  // The same panels appear on the right (desktop) and in the drawer (smaller
  // screens); `listId` keeps their ⋯ menus apart.
  const panels = (listId) => (
    <>
      <WaysToHelp onTask={onTask} />
      <RecentChats
        state={recent}
        activeId={conversation?.id ?? null}
        onOpen={openChat}
        onSeeAll={() => setAllOpen(true)}
        onRetry={loadRecent}
        listId={listId}
        menu={menu}
        onMenu={setMenu}
        onRename={startRename}
        onDelete={startDelete}
      />
    </>
  )

  return (
    <div className="ch-page">
      <header className="ch-page-head">
        <div>
          <h1 className="pk-title">AI Chat</h1>
          <p className="hm-sub">Ask questions, get study help, and learn smarter with Novi.</p>
        </div>
        <div className="ch-page-actions">
          <button type="button" className="btn btn-secondary ch-panels-btn" onClick={() => setDrawerOpen(true)}>
            <IconPanel width={17} height={17} />
            <span>Help &amp; chats</span>
          </button>
          {active && (
            <button type="button" className="ch-new" onClick={newChat}>
              <IconPlus width={17} height={17} />
              <span>New chat</span>
            </button>
          )}
        </div>
      </header>

      <div className="ch-layout">
        <section className={`ch-card${active ? ' is-active' : ''}`} aria-label={`Chat with ${buddyName}`}>
          {active && (
            <header className={`ch-head${busy ? ' is-typing' : ''}`}>
              <span className="ch-head-avatar">
                <NoviAvatar size={40} />
                <span className="ch-presence" aria-hidden="true" />
              </span>
              <div className="ch-head-text">
                <p className="ch-head-name">
                  {buddyName} <span className="ch-head-tag">AI study buddy</span>
                </p>
                {/* Like a messaging app: online, or typing while a reply is on its way. */}
                <p className={`ch-head-sub${busy ? ' is-typing' : ''}`}>
                  {busy ? 'typing…' : 'Online'}
                </p>
              </div>
              {conversation && <p className="ch-head-title" title={conversation.title}>{conversation.title}</p>}
            </header>
          )}

          <div className={`ch-scroll${active ? '' : ' is-welcome'}`} ref={scrollRef}>
            {!active ? (
              <div className="ch-welcome">
                <MascotRig pose="waving" className="ch-welcome-art" />
                <h2 className="ch-hello">Hi {firstName ?? 'there'}! <span aria-hidden="true">👋</span></h2>
                <p className="ch-intro">
                  I&apos;m {buddyName}, your AI study buddy. Ask me anything about your study materials, concepts, or learning journey!
                </p>
                <ul className="ch-starters">
                  {STARTERS.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="ch-starter" onClick={() => submit(s.prompt)} disabled={busy}>
                        <span className={`ch-starter-label tone-${s.tone}`}>{s.label}</span>
                        <span className="ch-starter-text">{s.prompt}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : view === 'loading' ? (
              <LoadingRegion label="Loading the conversation…" as="ul" className="ch-messages">
                {[0, 1, 2].map((i) => (
                  <li key={i} className={`ch-msg ${i % 2 ? 'is-user' : 'is-buddy'}`}>
                    {i % 2 === 0 && <Sk w={32} h={32} r="50%" />}
                    <div className="ch-msg-body">
                      <div className="ch-bubble is-skel"><SkText lines={i % 2 ? 1 : 3} widths={i % 2 ? ['70%'] : ['92%', '84%', '55%']} /></div>
                    </div>
                  </li>
                ))}
              </LoadingRegion>
            ) : view === 'missing' || view === 'error' ? (
              <div className="ch-state" role="alert">
                <p className="ch-state-title">
                  {view === 'missing' ? 'This chat no longer exists.' : 'This chat could not be loaded.'}
                </p>
                <div className="ch-state-actions">
                  {view === 'error' && (
                    <button
                      type="button"
                      className="btn btn-secondary ch-small-btn"
                      onClick={() => {
                        shownId.current = null
                        setReloadKey((k) => k + 1)
                      }}
                    >
                      Try again
                    </button>
                  )}
                  <button type="button" className="ch-new" onClick={newChat}>Start a new chat</button>
                </div>
              </div>
            ) : (
              <div role="log" aria-live="polite" aria-label="Conversation">
                <ol className="ch-messages">
                  {messages.map((m, i) =>
                    m.role === 'user' ? (
                      <UserMessage key={m.id} message={m} initials={initials} />
                    ) : (
                      <BuddyMessage
                        key={m.id}
                        message={m}
                        canRegenerate={i === lastIndex && !m.metadata.quiz}
                        isLast={i === lastIndex}
                        busy={busy}
                        onRegenerate={regenerate}
                        onFeedback={onFeedback}
                        onAskCount={(n, topic) => submit(`Make ${n} practice questions on ${topic}`)}
                        arrived={arrived?.id === m.id ? arrived.mode : null}
                      />
                    ),
                  )}
                  {busy && <TypingIndicator name={buddyName} />}
                </ol>
                {followUps.length > 0 && (
                  <div className={`ch-followups${arrived ? ' is-arrived' : ''}`} aria-label="Suggested follow-ups">
                    {followUps.map((f) => (
                      <button key={f} type="button" className="ch-followup" onClick={() => submit(f)}>{f}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ch-bottom">
            {failure && (
              <div className="ch-failure" role="alert">
                <p>{failure.message}</p>
                <button type="button" className="btn btn-secondary ch-small-btn" onClick={retry} disabled={busy}>
                  Try again
                </button>
              </div>
            )}
            <ChatComposer
              ref={inputRef}
              buddyName={buddyName}
              value={draft}
              onChange={(v) => {
                setDraft(v)
                if (!v) setHint(null)
              }}
              onSubmit={submit}
              busy={busy || view !== 'ready'}
              packs={packs.items}
              packsLoading={packs.loading}
              pack={selectedPack}
              onPackChange={(p) => setPackId(p?.id ?? null)}
              attachment={attachment}
              onAttach={onAttach}
              onRemoveAttachment={removeAttachment}
              hint={hint}
            />
            <p className="ch-disclaimer">Novi can make mistakes. Always double-check important information.</p>
          </div>
        </section>

        <aside className="ch-side" aria-label="Chat tools">{panels('panel')}</aside>
      </div>

      {/* Tablet and phone: the same panels in a drawer. */}
      <Modal open={drawerOpen} onRequestClose={() => setDrawerOpen(false)} onClosed={() => setMenu(null)} labelledBy="ch-drawer-title" className="ch-drawer">
        <div className="ch-drawer-body">
          <div className="ch-drawer-head">
            <h2 id="ch-drawer-title" className="ch-panel-title">Help &amp; chats</h2>
            <button type="button" className="nv-modal-close" onClick={() => setDrawerOpen(false)} aria-label="Close">
              <IconX />
            </button>
          </div>
          {panels('drawer')}
        </div>
      </Modal>

      <Modal open={allOpen} onRequestClose={() => setAllOpen(false)} onClosed={() => setMenu(null)} labelledBy="ch-all-title">
        <div className="nv-modal-panel">
          <div className="nv-modal-head">
            <div>
              <h2 id="ch-all-title" className="nv-modal-title">All chats</h2>
              <p className="hm-sub">Your most recent {recent.items?.length ?? 0} conversations with Novi.</p>
            </div>
            <button type="button" className="nv-modal-close" onClick={() => setAllOpen(false)} aria-label="Close">
              <IconX />
            </button>
          </div>
          {(recent.items ?? []).length === 0 ? (
            <p className="hm-empty-line">Your conversations with Novi will appear here.</p>
          ) : (
            <ChatList
              items={recent.items ?? []}
              activeId={conversation?.id ?? null}
              onOpen={openChat}
              listId="all"
              menu={menu}
              onMenu={setMenu}
              onRename={startRename}
              onDelete={startDelete}
            />
          )}
        </div>
      </Modal>

      <RenameDialog
        open={Boolean(renaming?.open)}
        conversation={renaming?.conversation ?? null}
        onCancel={() => setRenaming((r) => (r ? { ...r, open: false } : r))}
        onSave={saveRename}
        onClosed={() => {
          setRenaming(null)
          restoreFocus()
        }}
      />
      <DeleteDialog
        open={Boolean(removing?.open)}
        conversation={removing?.conversation ?? null}
        busy={Boolean(removing?.busy)}
        error={removing?.error ?? null}
        onCancel={() => setRemoving((d) => (d && !d.busy ? { ...d, open: false } : d))}
        onConfirm={confirmDelete}
        onClosed={() => {
          setRemoving(null)
          restoreFocus()
        }}
      />

      {notice && <div className="nv-toast" role="status">{notice}</div>}
    </div>
  )
}
