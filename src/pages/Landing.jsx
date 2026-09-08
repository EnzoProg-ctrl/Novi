import { Link } from 'react-router-dom'
import { Logo, Mascot } from '../components/Mascot'

const POINTS = [
  {
    title: 'Bring your own material',
    body: 'Upload slides, PDFs, documents, or photos of your notes. Novi reads them and works from what your class actually covers.',
  },
  {
    title: 'Get study material back',
    body: 'Clear summaries, the key terms worth knowing, and practice questions pitched at the right level.',
  },
  {
    title: 'A buddy that learns you',
    body: 'Novi notices which explanations land and which topics keep tripping you up, then adjusts what it asks next.',
  },
]

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-bar">
        <Logo />
        <nav className="landing-nav">
          <Link to="/signin" className="btn btn-ghost">Sign in</Link>
          <Link to="/signup" className="btn btn-primary">Get started</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="badge badge-coral">Your study buddy</span>
            <h1>Studying goes better with someone in your corner.</h1>
            <p className="hero-sub">
              Novi turns your own course material into summaries, key concepts, and practice
              questions, then studies alongside you and adapts as it learns how you learn.
            </p>
            <div className="hero-actions">
              <Link to="/signup" className="btn btn-primary btn-lg">Create your buddy</Link>
              <Link to="/signin" className="btn btn-secondary btn-lg">I already have an account</Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orb">
              <Mascot size={128} />
            </div>
          </div>
        </section>

        <section className="points">
          {POINTS.map((point) => (
            <article key={point.title} className="card card-pad point">
              <h3>{point.title}</h3>
              <p className="hint">{point.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="landing-foot">
        <p className="hint">Novi, a personalized AI study companion.</p>
      </footer>
    </div>
  )
}
