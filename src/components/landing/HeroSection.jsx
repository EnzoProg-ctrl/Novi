import { Link } from 'react-router-dom'
import { MascotRig } from '../MascotRig'
import { DashboardMockup } from './DashboardMockup'
import { IconArrowRight } from './icons'
import './hero.css'

export function HeroSection() {
  return (
    <section className="nv-hero">
      <div className="nv-hero-inner">
        <div className="nv-hero-copy">
          <h1 className="nv-hero-title">
            Study smarter,
            <br />
            with <span className="nv-accent">Novi.</span>
          </h1>

          <p className="nv-hero-sub">
            Turn your notes into personalized study materials, practice with AI-generated
            questions, and track your progress—all in one place.
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

          <p className="nv-hero-note">Free to start. No credit card required.</p>
        </div>

        <div className="nv-hero-art">
          <span className="nv-hero-blob" aria-hidden="true" />
          <DashboardMockup />
          <MascotRig
            pose="waving"
            outfit="default"
            className="nv-mascot"
            alt="Novi, a friendly capybara study buddy in an astronaut suit, waving"
          />
        </div>
      </div>
    </section>
  )
}
