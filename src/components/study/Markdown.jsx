/**
 * Minimal markdown renderer for AI-written summaries.
 *
 * Deliberately not a library and deliberately not dangerouslySetInnerHTML: it
 * builds React elements, so generated text can never inject markup. Handles the
 * subset the model actually produces - headings, bullet and numbered lists,
 * bold, italic and inline code.
 */

/** Splits a line into React nodes, honouring **bold**, *italic* and `code`. */
function renderInline(text, keyPrefix) {
  const nodes = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let match
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${i++}`

    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ content, className = '' }) {
  if (!content) return null

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let list = null // { ordered, items: [] }

  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`list-${blocks.length}`} className="md-list">
        {list.items.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    )
    list = null
  }

  lines.forEach((raw, index) => {
    const line = raw.trim()

    if (!line) {
      flushList()
      return
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushList()
      const level = Math.min(heading[1].length + 1, 5) // never emit an h1 here
      const Tag = `h${level}`
      blocks.push(
        <Tag key={`h-${index}`} className="md-heading">
          {renderInline(heading[2], `h-${index}`)}
        </Tag>,
      )
      return
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)

    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)[1])
      return
    }

    flushList()
    blocks.push(
      <p key={`p-${index}`} className="md-p">
        {renderInline(line, `p-${index}`)}
      </p>,
    )
  })

  flushList()

  return <div className={`md ${className}`.trim()}>{blocks}</div>
}
