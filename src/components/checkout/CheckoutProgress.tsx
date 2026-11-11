'use client'

import { motion } from 'framer-motion'
import { CheckIcon } from 'lucide-react'
import type React from 'react'

import { cn } from '@/lib/utils'

export const CHECKOUT_STAGES: readonly string[] = ['Kosár', 'Adatok', 'Átvétel és szállítás', 'Összesítés', 'Visszaigazolás']

type CheckoutProgressProps = {
  /** Index into CHECKOUT_STAGES. The last stage is only reached on the confirmation page. */
  current: number
  /** Called when the customer returns to an earlier, completed stage. */
  onSelect?: (stage: number) => void
  /** Fill fraction to animate from on first render (e.g. the confirmation page starts at the review stage). */
  initialFraction?: number
}

/**
 * Progress bar with step labels. Completed stages show a check icon, the current stage a
 * filled number with a ring and `aria-current="step"`, upcoming stages an outlined number,
 * so state never depends on color alone. Transform-only fill respects reduced motion.
 */
export function CheckoutProgress(props: CheckoutProgressProps): React.JSX.Element {
  const last = CHECKOUT_STAGES.length - 1
  const fraction = Math.min(Math.max(props.current / last, 0), 1)
  const currentLabel = CHECKOUT_STAGES[props.current] ?? ''

  return (
    <nav aria-label="Rendelés lépései" className="mb-8">
      <div className="relative">
        {/* Track spans from the first to the last step centre (10%–90% of a 5-column grid). */}
        <div aria-hidden="true" className="absolute top-4 right-[10%] left-[10%] h-1 -translate-y-1/2 rounded-full bg-muted">
          <motion.div
            className="h-full origin-left rounded-full bg-primary"
            initial={{ scaleX: props.initialFraction ?? fraction }}
            animate={{ scaleX: fraction }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <ol className="relative grid grid-cols-5">
          {CHECKOUT_STAGES.map((label: string, index: number) => {
            const state = index < props.current ? 'done' : index === props.current ? 'current' : 'upcoming'
            const stateText = state === 'done' ? ' (kész)' : state === 'current' ? ' (aktuális lépés)' : ''
            const marker = (
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-ink bg-ink text-white ring-4 ring-ink/15',
                  state === 'upcoming' && 'border-input bg-background text-muted-foreground',
                )}
              >
                {state === 'done' ? <CheckIcon className="size-4" strokeWidth={3} /> : index + 1}
              </span>
            )
            const text = (
              <span aria-hidden="true" className={cn('mt-2 hidden text-center text-xs leading-tight sm:block', state === 'current' ? 'font-bold text-ink' : 'text-muted-foreground')}>{label}</span>
            )
            const canReturn = state === 'done' && props.onSelect !== undefined && index < last
            return (
              <li key={label} className="flex flex-col items-center" aria-current={state === 'current' ? 'step' : undefined}>
                {canReturn ? (
                  <button
                    type="button"
                    onClick={() => props.onSelect?.(index)}
                    className="flex cursor-pointer flex-col items-center rounded-xl p-0.5 outline-none hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {marker}
                    {text}
                    <span className="sr-only">{`${index + 1}. ${label}${stateText} – visszalépés`}</span>
                  </button>
                ) : (
                  <span className="flex flex-col items-center p-0.5">
                    {marker}
                    {text}
                    <span className="sr-only">{`${index + 1}. ${label}${stateText}`}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
      {/* Small screens show only the current label to stay readable. */}
      <p className="mt-3 text-center text-sm sm:hidden" aria-hidden="true">
        <span className="text-muted-foreground">
          {props.current + 1}/{CHECKOUT_STAGES.length}. lépés:
        </span>{' '}
        <strong className="text-ink">{currentLabel}</strong>
      </p>
    </nav>
  )
}
