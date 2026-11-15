import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchEverything } from '../../lib/search'
import { IconSearch } from './AppIcons'

const DEBOUNCE_MS = 200

const GROUPS = [
  { key: 'packs', label: 'Study packs' },
  { key: 'topics', label: 'Topics & concepts' },
  { key: 'chats', label: 'Chats' },
]

/** One flat, ordered list of choices, so the arrow keys move through every group. */
function toOptions(results) {
  return [
    ...results.packs.map((p) => ({
      id: `pack-${p.id}`,
      group: 'packs',
      label: p.title,
      detail: `${p.questions} ${p.questions === 1 ? 'question' : 'questions'}`,
      to: `/packs?pack=${p.id}`,
    })),
    ...results.topics.map((t) => ({
      id: `topic-${t.key}`,
      group: 'topics',
      label: t.name,
      detail: `${t.kind === 'concept' ? 'Key concept' : 'Topic'} · in ${t.packTitle}`,
      to: `/packs?pack=${t.packId}`,
    })),
    ...results.chats.map((c) => ({
      id: `chat-${c.id}`,
      group: 'chats',
      label: c.title || 'Untitled chat',
      detail: 'AI Chat',
      to: `/chat/${c.id}`,
    })),
  ]
}

/**
 * The search box in the top bar. Finds study packs, topics and key concepts,
 * and chats as the student types, in a dropdown they can use with the mouse
 * or the keyboard (arrows, Enter, Escape). "/" focuses it from anywhere.
 */
export function TopbarSearch() {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const latest = useRef(0)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // 'idle' | 'loading' | 'done' | 'error'
  const [state, setState] = useState('idle')
  const [options, setOptions] = useState([])
  const [active, setActive] = useState(-1)

  const text = query.trim()

  // Look things up shortly after the last keystroke.
  useEffect(() => {
    // Too short to search: drop any search still on its way. (The dropdown
    // only shows for two or more characters, so old results never appear.)
    if (text.length < 2) {
      latest.current += 1
      return
    }
    const request = ++latest.current
    setState('loading')
    const timer = setTimeout(async () => {
      try {
        const results = await searchEverything(text)
        // An older, slower search must never replace newer results.
        if (request !== latest.current) return
        setOptions(toOptions(results))
        setActive(-1)
        setState('done')
      } catch (err) {
        if (request !== latest.current) return
        console.warn('Search failed:', err)
        setOptions([])
        setState('error')
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  // "/" focuses the search, unless the student is typing somewhere else.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const el = document.activeElement
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if (typing || document.querySelector('dialog[open]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function choose(option) {
    if (!option) return
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    navigate(option.to)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      } else if (query) {
        setQuery('')
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + options.length) % options.length)
    }
  }

  const showList = open && text.length >= 2
  const activeOption = showList && active >= 0 ? options[active] : null

  return (
    <div
      ref={wrapRef}
      className="nv-search-wrap"
      onBlur={(event) => {
        // Closes unless focus moved to something inside the search.
        if (!wrapRef.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <form
        className="nv-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          choose(activeOption ?? options[0])
        }}
      >
        <IconSearch width={18} height={18} />
        <input
          ref={inputRef}
          type="search"
          className="nv-search-input"
          placeholder="Search packs, topics and chats..."
          aria-label="Search packs, topics and chats"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </form>

      {showList && (
        <div className="nv-search-pop">
          {state === 'loading' && <p className="nv-search-note">Searching…</p>}
          {state === 'error' && <p className="nv-search-note">Search isn&apos;t working right now. Try again in a moment.</p>}
          {state === 'done' && options.length === 0 && (
            <p className="nv-search-note">No results for &ldquo;{text}&rdquo;.</p>
          )}
          <ul id={listId} role="listbox" aria-label="Search results" className="nv-search-list" hidden={!options.length}>
            {GROUPS.map((group) => {
              const items = options.filter((o) => o.group === group.key)
              if (!items.length) return null
              return (
                <li key={group.key} role="presentation">
                  <p className="nv-search-group" aria-hidden="true">{group.label}</p>
                  <ul role="group" aria-label={group.label}>
                    {items.map((option) => {
                      const index = options.indexOf(option)
                      return (
                        <li
                          key={option.id}
                          id={`${listId}-${option.id}`}
                          role="option"
                          aria-selected={index === active}
                          className={`nv-search-item${index === active ? ' is-active' : ''}`}
                          // Keep focus in the box so the click isn't lost to a blur.
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => choose(option)}
                        >
                          <span className="nv-search-label">{option.label}</span>
                          <span className="nv-search-detail">{option.detail}</span>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
