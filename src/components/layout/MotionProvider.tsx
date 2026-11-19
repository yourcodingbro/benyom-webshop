'use client'

import { MotionConfig } from 'framer-motion'
import type React from 'react'
import { useEffect } from 'react'

type MotionProviderProps = {
  children: React.ReactNode
}

/** Applies the user's reduced-motion preference to every framer-motion animation. */
export function MotionProvider(props: MotionProviderProps): React.JSX.Element {
  // Hydrated: framer-motion now owns Reveal, so the no-hydration CSS fallback in the root layout stops applying.
  useEffect(() => {
    document.documentElement.dataset.hydrated = ''
  }, [])
  return <MotionConfig reducedMotion="user">{props.children}</MotionConfig>
}
