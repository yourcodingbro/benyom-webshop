'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type React from 'react'

import { cn } from '@/lib/utils'

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
  /**
   * "view" (default): framer-motion fade/slide when the element scrolls into view. Decorative content only.
   * "enter": CSS fade and short rise when the element is inserted, for essential content such as product cards.
   * Its hidden start applies only during the animation, never as a lasting state: without JavaScript, with
   * animations off or with reduced motion the content is simply visible, and no viewport observer is involved.
   */
  trigger?: 'view' | 'enter'
  /** "enter" only: position in a list, for a small stagger (capped, so long lists never wait). */
  index?: number
}

const OFFSETS: Record<RevealDirection, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  none: { x: 0, y: 0 },
}

/** "enter" stagger: 50 ms per item, at most 250 ms (the 6th item onwards starts together). */
const ENTER_STAGGER_MS: number = 50
const ENTER_STAGGER_MAX_MS: number = 250

/**
 * Subtle fade/slide-in.
 * - Reduced-motion users get an instant fade without movement ("view") or no animation at all ("enter").
 * - "view": without JavaScript the `[data-reveal]` noscript rule in the root layout keeps content visible.
 * - Only transform/opacity are animated, so there is no layout shift.
 * - "enter" plays when its element is mounted: React keys decide when. A stable key (e.g. the product id) means a
 *   card animates when it newly appears after filtering or paging, but never again for its own state changes.
 */
export function Reveal(props: RevealProps): React.JSX.Element {
  const reduceMotion = useReducedMotion()
  if (props.trigger === 'enter') {
    const delay = Math.min((props.index ?? 0) * ENTER_STAGGER_MS, ENTER_STAGGER_MAX_MS)
    return (
      <div
        className={cn('animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-400 ease-out motion-reduce:animate-none', props.className)}
        style={{ '--tw-animation-delay': `${delay}ms` } as React.CSSProperties}
      >
        {props.children}
      </div>
    )
  }
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
