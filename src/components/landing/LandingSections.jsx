import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { MascotRig } from '../MascotRig'
import { NoviMark } from './NoviMark'
import { IconArrowRight, IconChart, IconChat, IconChevronDown, IconSparkle, IconUpload } from './icons'
import './sections.css'

const FEATURES = [
  { title: 'Upload Materials', body: 'Bring your notes and supported documents into Novi.', Icon: IconUpload },
  { title: 'AI Study Tools', body: 'Create summaries, practice questions, and more.', Icon: IconSparkle },
  { title: 'Study with Novi', body: 'Get explanations and study support whenever you need help.', Icon: IconChat },
  { title: 'Track Progress', body: 'Understand your performance and know what to review next.', Icon: IconChart },
]

export function FeaturesSection() {
  return (
    <section id="features" className="nv-section nv-features" aria-labelledby="nv-features-title">
      <div className="nv-shell">
        <header className="nv-section-head">
          <h2 id="nv-features-title" className="nv-h2">Everything you need to study better</h2>
          <p className="nv-section-sub">Your materials, practice, and progress in one place.</p>
        </header>

        <ul className="nv-feature-grid">
          {FEATURES.map(({ title, body, Icon }) => (
            <li key={title} className="nv-feature">
              <span className="nv-feature-icon"><Icon width={24} height={24} /></span>
              <h3 className="nv-feature-title">{title}</h3>
              <p className="nv-feature-body">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const STEPS = [
  {
    title: 'Upload your study materials',
    body: 'Add your notes or supported documents to create a study pack.',
  },
  {
    title: 'Generate your study content',
    body: 'Use AI to turn the material into summaries and practice questions.',
  },
  {
    title: 'Practice and improve',
    body: 'Answer questions, review difficult concepts, and monitor your progress.',
  },
]

/** Stacked note cards with a sparkle: notes turning into study material. */
function NotesArt() {
  return (
    <div className="nv-notes" aria-hidden="true">
      <span className="nv-note nv-note-back" />
      <span className="nv-note nv-note-mid" />
      <span className="nv-note nv-note-front">
        <i className="nv-note-head" />
        <i />
        <i />
        <i className="nv-note-short" />
        <span className="nv-note-check" />
      </span>
      <IconSparkle className="nv-notes-spark nv-notes-spark-lg" width={46} height={46} />
      <IconSparkle className="nv-notes-spark nv-notes-spark-sm" width={22} height={22} />
    </div>
  )
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="nv-section nv-how-wrap" aria-labelledby="nv-how-title">
      <div className="nv-shell">
        <div className="nv-how">
          <header className="nv-how-head">
            <h2 id="nv-how-title" className="nv-h2">How Novi Works</h2>
            <p className="nv-section-sub">From your notes to real progress, in three simple steps.</p>
          </header>

          <ol className="nv-steps">
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className="nv-step">
                <span className="nv-step-num">{i + 1}</span>
                <h3 className="nv-step-title">{title}</h3>
                <p className="nv-step-body">{body}</p>
              </li>
            ))}
          </ol>

          <NotesArt />
        </div>
      </div>
    </section>
  )
}

const FAQS = [
  {
    q: 'What is Novi?',
    a: 'Novi is a study app with an AI study buddy. Add your notes and Novi builds a study pack from them: a summary, the key concepts, and practice questions. A calendar and a progress page help you keep going.',
  },
  {
    q: 'What types of files can I upload?',
    a: 'PDF, PowerPoint (.pptx), Word (.docx), plain text and Markdown notes, and photos of your notes (PNG, JPG, WebP, or HEIC), up to 50 MB per file.',
  },
  {
    q: 'How does the AI generate study materials?',
    a: 'Novi reads the text in your material and sends it to AI models (from Groq and Google Gemini), which write the summary, pick out key concepts, and draft practice questions from it. Everything comes from your own material, so check anything that looks off against your notes.',
  },
  {
    q: 'Is Novi free to use?',
    a: 'Yes. Novi is free to use, and signing up doesn’t ask for a credit card.',
  },
]

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className={`nv-faq-item${open ? ' is-open' : ''}`}>
      <h3 className="nv-faq-q">
        <button
          type="button"
          className="nv-faq-btn"
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={() => setOpen((v) => !v)}
        >
          {q}
          <IconChevronDown className="nv-faq-chev" width={20} height={20} />
        </button>
      </h3>
      <div id={`${id}-a`} className="nv-faq-a" role="region" aria-label={q} inert={!open}>
        <div>
          <p>{a}</p>
        </div>
      </div>
    </li>
  )
}

export function FaqSection() {
  return (
    <section id="faq" className="nv-section nv-faq-wrap" aria-labelledby="nv-faq-title">
      <div className="nv-shell nv-faq">
        <header>
          <h2 id="nv-faq-title" className="nv-h2">Frequently Asked Questions</h2>
          <p className="nv-section-sub">Find quick answers about Novi.</p>
        </header>
        <ul className="nv-faq-list">
          {FAQS.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </ul>
      </div>
    </section>
  )
}

export function CtaBand() {
  return (
    <section className="nv-section nv-cta-wrap" aria-labelledby="nv-cta-title">
      <div className="nv-shell">
        <div className="nv-band">
          <MascotRig pose="front" outfit="default" className="nv-band-mascot" />
          <div className="nv-band-copy">
            <h2 id="nv-cta-title" className="nv-band-title">Ready to study smarter?</h2>
            <p className="nv-band-sub">Join Novi today and turn your notes into real progress.</p>
          </div>
          <Link to="/signup" className="nv-band-btn">
            Get Started
            <IconArrowRight width={18} height={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}

const FOOTER_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
]

export function LandingFooter() {
  return (
    <footer className="nv-footer">
      <div className="nv-shell nv-footer-inner">
        <div className="nv-footer-brand">
          <Link to="/" className="nv-footer-logo" aria-label="Novi home">
            <NoviMark size={30} />
            <span>Novi</span>
          </Link>
          <span className="nv-footer-rule" aria-hidden="true" />
          <p className="nv-footer-tag">Study smarter with your AI study buddy.</p>
        </div>
        <nav className="nv-footer-links" aria-label="Footer">
          {FOOTER_LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
