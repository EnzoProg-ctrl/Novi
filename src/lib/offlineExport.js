import { fetchStudyPack } from './packs'

/**
 * "Download for offline": one self-contained .html file holding the chosen
 * packs (summary, key concepts and a quiz with a score), which opens in any
 * browser with no internet and no Novi account. Nothing in it calls out:
 * no fonts, scripts or images are loaded from anywhere.
 *
 * Safety: the pack text is user content, so it never becomes markup. The
 * summary's markdown is escaped first and only then given headings, bold and
 * lists; the quiz data travels as JSON (with "<" escaped so it can't close
 * its script tag) and the page's script writes it with textContent.
 */

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Escaped inline markdown: **bold**, *italic*, `code`. */
const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')

/** The small slice of markdown the summaries use: headings, lists, paragraphs. */
export function markdownToSafeHtml(markdown) {
  const out = []
  let list = null
  let para = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    const bullet = line.match(/^[-*+]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (heading) {
      flushPara()
      flushList()
      const level = Math.min(heading[1].length + 2, 6) // the page's own h1/h2 sit above
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    } else if (bullet || numbered) {
      flushPara()
      const tag = bullet ? 'ul' : 'ol'
      if (list?.tag !== tag) {
        flushList()
        list = { tag, items: [] }
      }
      list.items.push((bullet ?? numbered)[1])
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return out.join('\n')
}

/** Only what the offline page needs, in the order practice uses. */
function packForFile(pack) {
  return {
    title: pack.title,
    subject: pack.subject,
    summaryHtml: markdownToSafeHtml(pack.summary),
    concepts: pack.concepts.map((c) => ({ term: c.term, definition: c.definition, example: c.example ?? null })),
    questions: pack.questions
      .filter((q) => q.prompt && q.correct_answer != null)
      .map((q) => ({
        type: q.type,
        prompt: q.prompt,
        choices: q.type === 'multiple_choice' && Array.isArray(q.choices) ? q.choices.map(String) : null,
        answer: String(q.correct_answer),
        explanation: q.explanation ?? null,
      })),
  }
}

// JSON inside <script>: "<" escaped so "</script>" in a pack can't end the tag.
const jsonForScript = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const STYLES = String.raw`
:root {
  color-scheme: light dark;
  --bg: #ffffff; --soft: #f6f6f9; --line: #e4e5ec; --ink: #1b2134; --ink-soft: #4a5068; --muted: #737a92;
  --accent: #e2574a; --accent-tint: #fdeeec; --on-accent: #ffffff;
  --good: #1f8a5b; --good-tint: #e6f5ee; --bad: #c2412f; --bad-tint: #fcebe8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161f; --soft: #1c1f2b; --line: #2c3040; --ink: #eef0f6; --ink-soft: #c2c6d4; --muted: #8f95aa;
    --accent: #ff7a6b; --accent-tint: #3a2220; --on-accent: #1b0f0d;
    --good: #5fcf99; --good-tint: #173327; --bad: #ff8a78; --bad-tint: #3a1f1b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 760px; margin: 0 auto; padding: 28px 16px 64px; }
header.top { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
.brand { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0; font-size: 1.7rem; line-height: 1.25; letter-spacing: -0.02em; }
.sub { margin: 0; color: var(--muted); font-size: 0.92rem; }
.picker { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; }
.picker button {
  padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--bg);
  color: var(--ink-soft); font: inherit; font-size: 0.88rem; cursor: pointer;
}
.picker button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-tint); color: var(--ink); font-weight: 600; }
nav.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
nav.tabs button {
  padding: 10px 12px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none;
  color: var(--muted); font: inherit; font-weight: 600; cursor: pointer;
}
nav.tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.summary h3, .summary h4, .summary h5, .summary h6 { margin: 1.4em 0 0.4em; line-height: 1.3; }
.summary p, .summary ul, .summary ol { margin: 0 0 0.9em; }
.summary code { padding: 1px 5px; border-radius: 5px; background: var(--soft); font-size: 0.9em; }
.concepts { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.concepts li { padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; }
.concepts strong { display: block; margin-bottom: 4px; }
.concepts p { margin: 0; color: var(--ink-soft); }
.concepts .ex { margin-top: 6px; font-size: 0.9rem; color: var(--muted); }
.card { padding: 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg); }
.progress { display: flex; justify-content: space-between; margin-bottom: 12px; color: var(--muted); font-size: 0.85rem; }
.prompt { margin: 0 0 16px; font-size: 1.08rem; font-weight: 600; line-height: 1.45; }
.choices { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 8px; }
.choices button {
  width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg);
  color: var(--ink); font: inherit; text-align: left; cursor: pointer;
}
.choices button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-tint); }
.choices button.right { border-color: var(--good); background: var(--good-tint); }
.choices button.wrong { border-color: var(--bad); background: var(--bad-tint); }
.choices button:disabled { cursor: default; }
input.typed {
  width: 100%; margin-bottom: 16px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg); color: var(--ink); font: inherit;
}
.verdict { margin: 0 0 14px; padding: 12px 14px; border-radius: 12px; }
.verdict.good { background: var(--good-tint); }
.verdict.bad { background: var(--bad-tint); }
.verdict.neutral { background: var(--soft); }
.verdict strong { display: block; }
.verdict p { margin: 4px 0 0; color: var(--ink-soft); }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  padding: 11px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg);
  color: var(--ink); font: inherit; font-weight: 600; cursor: pointer;
}
.btn.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
.btn:disabled { opacity: 0.5; cursor: default; }
.score { text-align: center; padding: 12px 0; }
.score .big { font-size: 2.6rem; font-weight: 750; line-height: 1.1; }
.empty { color: var(--muted); }
footer { margin-top: 40px; color: var(--muted); font-size: 0.8rem; }
@media (max-width: 520px) { .row .btn { flex: 1; } h1 { font-size: 1.45rem; } }
`

// Runs inside the downloaded file. Plain ES2017, no backticks or template
// placeholders, so it can sit inside this module's template string as is.
const SCRIPT = String.raw`
(function () {
  var data = JSON.parse(document.getElementById('novi-data').textContent);
  var packs = data.packs;
  var state = { pack: 0, tab: 'summary', quiz: null };
  var app = document.getElementById('app');
  var picker = document.getElementById('picker');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'onclick') node.addEventListener('click', attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  var norm = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  var normTyped = function (s) {
    return norm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an) /, '');
  };
  var AUTO = { multiple_choice: 1, true_false: 1, fill_blank: 1 };

  function newQuiz() { return { i: 0, right: 0, marked: 0, answer: '', checked: false, verdict: null }; }

  function renderPicker() {
    picker.textContent = '';
    if (packs.length < 2) { picker.hidden = true; return; }
    packs.forEach(function (p, i) {
      picker.appendChild(el('button', {
        type: 'button', 'aria-pressed': String(i === state.pack), text: p.title,
        onclick: function () { state.pack = i; state.quiz = null; render(); }
      }));
    });
  }

  function renderTabs() {
    var tabs = [['summary', 'Summary'], ['concepts', 'Key concepts'], ['quiz', 'Quiz']];
    return el('nav', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
      return el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(state.tab === t[0]), text: t[1],
        onclick: function () { state.tab = t[0]; render(); }
      });
    }));
  }

  function renderSummary(p) {
    var box = el('div', { class: 'summary' });
    if (p.summaryHtml) box.innerHTML = p.summaryHtml; // built from escaped text when downloaded
    else box.appendChild(el('p', { class: 'empty', text: 'This pack has no summary.' }));
    return box;
  }

  function renderConcepts(p) {
    if (!p.concepts.length) return el('p', { class: 'empty', text: 'This pack has no key concepts.' });
    return el('ul', { class: 'concepts' }, p.concepts.map(function (c) {
      return el('li', null, [
        el('strong', { text: c.term }),
        el('p', { text: c.definition }),
        c.example ? el('p', { class: 'ex', text: 'Example: ' + c.example }) : null
      ]);
    }));
  }

  function renderQuiz(p) {
    var qs = p.questions;
    if (!qs.length) return el('p', { class: 'empty', text: 'This pack has no questions.' });
    var quiz = state.quiz || (state.quiz = newQuiz());

    if (quiz.i >= qs.length) {
      var pct = Math.round((quiz.right / qs.length) * 100);
      return el('div', { class: 'card score' }, [
        el('p', { class: 'sub', text: 'Your score' }),
        el('p', { class: 'big', text: quiz.right + ' / ' + qs.length }),
        el('p', { class: 'sub', text: pct + '% correct' }),
        el('div', { class: 'row', style: 'justify-content:center;margin-top:12px' }, [
          el('button', { type: 'button', class: 'btn primary', text: 'Try again',
            onclick: function () { state.quiz = newQuiz(); render(); } })
        ])
      ]);
    }

    var q = qs[quiz.i];
    var auto = !!AUTO[q.type];
    var parts = [
      el('div', { class: 'progress' }, [
        el('span', { text: 'Question ' + (quiz.i + 1) + ' of ' + qs.length }),
        el('span', { text: quiz.right + ' right so far' })
      ]),
      el('p', { class: 'prompt', text: q.prompt })
    ];

    var choices = q.type === 'multiple_choice' && q.choices ? q.choices
      : q.type === 'true_false' ? ['True', 'False'] : null;

    if (choices) {
      parts.push(el('ul', { class: 'choices' }, choices.map(function (c) {
        var cls = '';
        if (quiz.checked) {
          if (norm(c) === norm(q.answer)) cls = 'right';
          else if (c === quiz.answer) cls = 'wrong';
        }
        var b = el('button', { type: 'button', class: cls, 'aria-pressed': String(c === quiz.answer), text: c,
          onclick: function () { if (!quiz.checked) { quiz.answer = c; render(); } } });
        if (quiz.checked) b.disabled = true;
        return el('li', null, [b]);
      })));
    } else if (q.type !== 'flashcard') {
      var input = el('input', { class: 'typed', type: 'text', 'aria-label': 'Your answer', placeholder: 'Type your answer', autocomplete: 'off' });
      input.value = quiz.answer;
      input.disabled = quiz.checked;
      input.addEventListener('input', function () { quiz.answer = input.value; check.disabled = !input.value.trim(); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && input.value.trim() && !quiz.checked) doCheck(); });
      parts.push(input);
    }

    function doCheck() {
      quiz.checked = true;
      if (auto) {
        var ok = q.type === 'fill_blank'
          ? normTyped(quiz.answer) !== '' && normTyped(quiz.answer) === normTyped(q.answer)
          : norm(quiz.answer) === norm(q.answer);
        quiz.verdict = ok ? 'good' : 'bad';
        if (ok) quiz.right++;
      } else {
        quiz.verdict = 'neutral'; // the student marks it themselves
      }
      render();
    }
    function next() {
      quiz.i++; quiz.answer = ''; quiz.checked = false; quiz.verdict = null; render();
    }

    if (quiz.checked) {
      var title = quiz.verdict === 'good' ? 'Correct' : quiz.verdict === 'bad' ? 'Not quite' : 'The answer';
      parts.push(el('div', { class: 'verdict ' + quiz.verdict }, [
        el('strong', { text: title }),
        quiz.verdict !== 'good' ? el('p', { text: (quiz.verdict === 'bad' ? 'The answer is ' : '') + q.answer }) : null,
        q.explanation ? el('p', { text: q.explanation }) : null
      ]));
      if (auto) {
        parts.push(el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn primary', text: quiz.i + 1 < qs.length ? 'Next question' : 'See score', onclick: next })
        ]));
      } else {
        parts.push(el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn primary', text: 'I got it', onclick: function () { quiz.right++; next(); } }),
          el('button', { type: 'button', class: 'btn', text: 'Not yet', onclick: next })
        ]));
      }
    } else {
      var check = el('button', { type: 'button', class: 'btn primary', text: q.type === 'flashcard' ? 'Show answer' : auto ? 'Check' : 'Show answer', onclick: doCheck });
      check.disabled = q.type !== 'flashcard' && !String(quiz.answer).trim();
      parts.push(el('div', { class: 'row' }, [check]));
    }
    return el('div', { class: 'card' }, parts);
  }

  function render() {
    var p = packs[state.pack];
    document.getElementById('pack-title').textContent = p.title;
    document.getElementById('pack-sub').textContent =
      [p.subject, p.concepts.length + ' concepts', p.questions.length + ' questions'].filter(Boolean).join(' · ');
    renderPicker();
    app.textContent = '';
    app.appendChild(renderTabs());
    app.appendChild(state.tab === 'summary' ? renderSummary(p) : state.tab === 'concepts' ? renderConcepts(p) : renderQuiz(p));
  }
  render();
})();
`

function buildHtml(packs) {
  const title = packs.length === 1 ? packs[0].title : `${packs.length} study packs`
  const saved = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(title)} · Novi</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <span class="brand">Novi study pack</span>
    <h1 id="pack-title">${escapeHtml(packs[0].title)}</h1>
    <p class="sub" id="pack-sub"></p>
  </header>
  <div class="picker" id="picker" role="group" aria-label="Packs in this file"></div>
  <main id="app"><noscript>Turn on JavaScript to use the quiz.</noscript></main>
  <footer>Saved from Novi on ${escapeHtml(saved)}. Works offline; your answers here are not saved to Novi.</footer>
</div>
<script type="application/json" id="novi-data">${jsonForScript({ packs })}</script>
<script>${SCRIPT}</script>
</body>
</html>
`
}

const fileName = (packs) => {
  const base = packs.length === 1 ? packs[0].title : 'novi-study-packs'
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${slug || 'novi-study-pack'}.html`
}

/** Fetches the packs (row level security applies) and saves the offline file. */
export async function downloadOffline(packIds) {
  const loaded = await Promise.all(packIds.map((id) => fetchStudyPack(id)))
  const packs = loaded.filter(Boolean).map(packForFile)
  if (packs.length === 0) throw new Error('Those packs could not be found.')

  const blob = new Blob([buildHtml(packs)], { type: 'text/html;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName(packs)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

// Exposed for testing the file without a download.
export const _buildOfflineHtml = (packs) => buildHtml(packs.map(packForFile))
