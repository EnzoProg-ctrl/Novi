import { Link } from 'react-router-dom'
import capybara from '../../assets/capybara_landingpage.webp'
import { DashboardMockup } from './DashboardMockup'
import {
  IconArrowRight,
  IconChart,
  IconDocument,
  IconPerson,
  IconSparkle,
  IconUpload,
} from './icons'
import './hero.css'

const POINTS = [
  { title: 'Upload anything', body: 'Notes, PDFs, slides, or images', Icon: IconUpload },
  { title: 'AI-powered study content', body: 'Summaries, practice questions, and more', Icon: IconDocument },
  { title: 'Personalized for you', body: 'Adapts to how you learn', Icon: IconPerson },
  { title: 'Track progress', body: 'See real improvements', Icon: IconChart },
]

export function HeroSection() {
  return (
    <section className="nv-hero">
      <div className="nv-hero-inner">
        <div className="nv-hero-copy">
          <span className="nv-badge">
            <IconSparkle width={15} height={15} />
            Your AI study buddy
          </span>

          <h1 className="nv-hero-title">
            Study smarter,
            <br />
            with <span className="nv-accent">Novi.</span>
          </h1>

          <p className="nv-hero-sub">
            Upload your notes, get personalized study materials, practice with AI-generated
            questions, and track your progress — all with a study buddy that learns how you
            learn.
          </p>

          <div className="nv-hero-actions">
            <Link to="/signup" className="nv-cta nv-cta-lg">
              Get Started
              <IconArrowRight width={18} height={18} />
            </Link>
            <a href="#how-it-works" className="nv-btn-outline">
              See How It Works
            </a>
          </div>

          <p className="nv-hero-note">Free to start. Your progress stays with you.</p>

          <ul className="nv-points">
            {POINTS.map(({ title, body, Icon }) => (
              <li key={title} className="nv-point">
                <span className="nv-point-icon">
                  <Icon width={20} height={20} />
                </span>
                <p className="nv-point-title">{title}</p>
                <p className="nv-point-body">{body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="nv-hero-art">
          <p className="nv-scribble" aria-hidden="true">
            Study brighter together! <span className="nv-heart">♥</span>
          </p>

          <img
            className="nv-mascot"
            src={capybara}
            width="1278"
            height="1230"
            alt="Novi, a friendly capybara study buddy in an astronaut suit, waving"
          />

          <DashboardMockup />
        </div>
      </div>
    </section>
  )
}
