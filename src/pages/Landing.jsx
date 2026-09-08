import { LandingNav } from '../components/landing/LandingNav'
import '../components/landing/landing.css'

export function Landing() {
  return (
    <div className="novi-landing">
      <LandingNav />
      {/* Sections below the nav are built one at a time. */}
    </div>
  )
}
