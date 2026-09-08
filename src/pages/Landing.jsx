import { HeroSection } from '../components/landing/HeroSection'
import { LandingNav } from '../components/landing/LandingNav'
import '../components/landing/landing.css'

export function Landing() {
  return (
    <div className="novi-landing">
      <LandingNav />
      <main>
        <HeroSection />
        {/* Sections below the hero are built one at a time. */}
      </main>
    </div>
  )
}
