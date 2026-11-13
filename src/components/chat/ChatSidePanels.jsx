import { IconChevronRight } from '../study/PackIcons'
import { LoadingRegion, Sk, SkText } from '../Skeleton'
import { IconBubble, IconBulb, IconDots, IconNotes, IconQuiz, IconTarget } from './ChatIcons'
import { ChatRowMenu } from './ChatRowMenu'
import { whenLabel } from '../../lib/chat'
import { RECENT_SHOWN, TASKS } from './chatPrompts'

const TASK_ICONS = { explain: IconBulb, practice: IconQuiz, summarize: IconNotes, strategies: IconTarget }

export function WaysToHelp({ onTask }) {
  return (
    <section className="hm-card ch-panel" aria-labelledby="ch-help-title">
      <h2 id="ch-help-title" className="ch-panel-title">Ways I Can Help</h2>
      <p className="hm-sub">Choose a task to get started.</p>
      <ul className="ch-tasks">
        {TASKS.map((task) => {
          const Icon = TASK_ICONS[task.id]
          return (
            <li key={task.id}>
              <button type="button" className="ch-task" onClick={() => onTask(task)}>
                <span className={`ch-tile tone-${task.tone}`}><Icon /></span>
                <span className="ch-task-text">
                  <span className="ch-task-title">{task.title}</span>
                  <span className="ch-task-desc">{task.description}</span>
                </span>
                <IconChevronRight className="ch-chev" width={16} height={16} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * A list of conversations. `listId` tells apart the copies of this list (the
 * panel, the phone drawer, "See all") so the ⋯ menu opens only next to the
 * button that was pressed. `menu` is { id, listId, anchor } or null, held by
 * the page so only one menu is ever open.
 */
export function ChatList({ items, activeId, onOpen, listId = 'panel', menu = null, onMenu, onRename, onDelete }) {
  return (
    <ul className="ch-recent">
      {items.map((c) => {
        const menuOpen = menu?.id === c.id && menu?.listId === listId
        return (
          <li key={c.id} className={`ch-recent-row${c.id === activeId ? ' is-active' : ''}${menuOpen ? ' has-menu' : ''}`}>
            <button
              type="button"
              className={`ch-recent-item${c.id === activeId ? ' is-active' : ''}`}
              aria-current={c.id === activeId ? 'true' : undefined}
              onClick={() => onOpen(c.id)}
            >
              <span className="ch-recent-icon"><IconBubble width={16} height={16} /></span>
              <span className="ch-recent-title" title={c.title}>{c.title}</span>
              <span className="ch-recent-when">{whenLabel(c.lastMessageAt)}</span>
            </button>
            {onMenu && (
              <button
                type="button"
                className="ch-recent-more"
                aria-label={`More options for ${c.title}`}
                title="More options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation()
                  onMenu(menuOpen ? null : { id: c.id, listId, anchor: event.currentTarget })
                }}
              >
                <IconDots width={18} height={18} />
              </button>
            )}
            {menuOpen && (
              <ChatRowMenu
                anchor={menu.anchor}
                title={c.title}
                onClose={() => onMenu(null)}
                onRename={() => onRename(c, menu.anchor)}
                onDelete={() => onDelete(c, menu.anchor)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function RecentChats({ state, activeId, onOpen, onSeeAll, onRetry, listId, menu, onMenu, onRename, onDelete }) {
  const items = state.items ?? []
  return (
    <section className="hm-card ch-panel" aria-labelledby="ch-recent-title">
      <div className="ch-panel-head">
        <h2 id="ch-recent-title" className="ch-panel-title">Recent Chats</h2>
        {items.length > RECENT_SHOWN && (
          <button type="button" className="hm-muted-link" onClick={onSeeAll}>See all</button>
        )}
      </div>

      {state.loading && !state.items ? (
        <LoadingRegion label="Loading your chats…" as="ul" className="ch-recent">
          {[0, 1, 2].map((i) => (
            <li key={i} className="ch-recent-item is-skel">
              <Sk w={30} h={30} r={9} />
              <SkText lines={1} widths={[`${80 - i * 15}%`]} />
              <Sk w={44} h={10} />
            </li>
          ))}
        </LoadingRegion>
      ) : state.error && !state.items ? (
        <div className="ch-panel-error" role="alert">
          <p>Your chats could not be loaded.</p>
          <button type="button" className="btn btn-secondary ch-small-btn" onClick={onRetry}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <p className="hm-empty-line">Your conversations with Novi will appear here.</p>
      ) : (
        <ChatList
          items={items.slice(0, RECENT_SHOWN)}
          activeId={activeId}
          onOpen={onOpen}
          listId={listId}
          menu={menu}
          onMenu={onMenu}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </section>
  )
}
