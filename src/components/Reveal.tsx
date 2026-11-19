'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type React from 'react'

type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'none'

type RevealProps = {
  children: React.ReactNode
  /** Seconds; capped at 0.6 to avoid long waits. */
  delay?: number
  /** Seconds; capped at 0.8. */
  duration?: number
  direction?: RevealDirection
  /** Travel distance in px. */
  distance?: number
  /** Animate only the first time the element enters the viewport (default true). */
  once?: boolean
  className?: string
}

const OFFSETS: Record<RevealDirection, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  none: { x: 0, y: 0 },
}

/**
 * Subtle fade/slide-in when content enters the viewport.
 * - Reduced-motion users get an instant fade without movement.
 * - Without JavaScript the `[data-reveal]` noscript rule in the root layout keeps content visible.
 * - Only transform/opacity are animated, so there is no layout shift.
 * - Decorative only (headings, hero, info boxes): never wrap essential content such as product cards, prices or
 *   specifications, which must stay visible even if animation or viewport detection never runs.
 */
export function Reveal(props: RevealProps): React.JSX.Element {
  const reduceMotion = useReducedMotion()
  const distance = reduceMotion ? 0 : (props.distance ?? 16)
  const offset = OFFSETS[props.direction ?? 'up']
  return (
    <motion.div
      data-reveal=""
      className={props.className}
      initial={{ opacity: 0, x: offset.x * distance, y: offset.y * distance }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      // "some" = any visible pixel. A share threshold (it was 0.15) can never be met by content taller than ~6.7
      // screens, e.g. a one-column product grid on a phone, which then stayed at opacity 0.
      viewport={{ once: props.once ?? true, amount: 'some' }}
      transition={{
        duration: reduceMotion ? 0.01 : Math.min(props.duration ?? 0.45, 0.8),
        delay: reduceMotion ? 0 : Math.min(props.delay ?? 0, 0.6),
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {props.children}
    </motion.div>
  )
}
