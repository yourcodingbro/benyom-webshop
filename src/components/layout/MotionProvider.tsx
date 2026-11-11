'use client'

import { MotionConfig } from 'framer-motion'
import type React from 'react'

type MotionProviderProps = {
  children: React.ReactNode
}

/** Applies the user's reduced-motion preference to every framer-motion animation. */
export function MotionProvider(props: MotionProviderProps): React.JSX.Element {
  return <MotionConfig reducedMotion="user">{props.children}</MotionConfig>
}
