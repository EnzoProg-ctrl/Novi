import { useEffect, useRef } from 'react'
import { HeroSection } from '../components/landing/HeroSection'
import { LandingNav } from '../components/landing/LandingNav'
import {
  CtaBand,
  FaqSection,
  FeaturesSection,
  HowItWorksSection,
  LandingFooter,
} from '../components/landing/LandingSections'
import '../components/landing/landing.css'

/**
 * Fades each section in as it scrolls into view and out as it leaves, in
 * either direction. A section counts as in view while any of it is inside
 * the middle band of the screen. `data-side` says which edge it left by, so
 * it drifts out the way it is going (up when scrolling down, and back).
 */
function useSectionReveal(rootRef) {
  useEffect(() => {
    const sections = rootRef.current?.querySelectorAll('main > section') ?? []
    if (!('IntersectionObserver' in window)) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) target.classList.toggle('is-shown', isIntersecting)
        // Every hidden section, not just the ones reported: an anchor jump
        // can carry a section past the screen without it ever intersecting.
        for (const section of sections) {
          if (!section.classList.contains('is-shown')) {
            section.dataset.side = section.getBoundingClientRect().top < 0 ? 'above' : 'below'
          }
        }
      },
      { rootMargin: '-10% 0px -10% 0px' },
    )
    // Sections already on screen start shown, so the first paint doesn't blink.
    const band = { top: window.innerHeight * 0.1, bottom: window.innerHeight * 0.9 }
    for (const section of sections) {
      const { top, bottom } = section.getBoundingClientRect()
      section.classList.toggle('is-shown', top < band.bottom && bottom > band.top)
      section.classList.add('nv-reveal')
      observer.observe(section)
    }
    return () => {
      observer.disconnect()
      for (const section of sections) section.classList.remove('nv-reveal', 'is-shown')
    }
  }, [rootRef])
}

export function Landing() {
  const rootRef = useRef(null)
  useSectionReveal(rootRef)

  return (
    <div className="novi-landing" ref={rootRef}>
      <LandingNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <FaqSection />
        <CtaBand />
      </main>
      <LandingFooter />
    </div>
  )
}
