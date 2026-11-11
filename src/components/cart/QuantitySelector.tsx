'use client'

import { MinusIcon, PlusIcon } from 'lucide-react'
import type React from 'react'
import { useId, useState } from 'react'

import { Button } from '@/components/shadcn/button'
import { parseQuantity } from '@/lib/quantity'
import { cn } from '@/lib/utils'

type QuantitySelectorProps = {
  /** Current valid quantity, or null while the typed value is invalid. */
  value: number | null
  onChange: (value: number | null) => void
  /** Per-line order cap (not stock). */
  max: number
  /** Accessible name of the input, e.g. "iPhone 17 Pro mennyisége". */
  label: string
  disabled?: boolean
  compact?: boolean
  className?: string
}

/** Minus / editable number / plus group. Arrow Up/Down also change the value. */
export function QuantitySelector(props: QuantitySelectorProps): React.JSX.Element {
  const errorId = useId()
  // null = not editing: show the committed value.
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? (props.value === null ? '' : String(props.value))
  const parsed = parseQuantity(text, props.max)
  const error = 'error' in parsed ? parsed.error : null
  const current = props.value ?? 1

  const commit = (next: number): void => {
    setDraft(null)
    props.onChange(Math.min(Math.max(next, 1), props.max))
  }

  const type = (value: string): void => {
    setDraft(value)
    const result = parseQuantity(value, props.max)
    props.onChange('value' in result ? result.value : null)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      commit(current + 1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      commit(current - 1)
    }
  }

  const buttonSize = props.compact ? 'icon-xs' : 'icon-sm'
  return (
    <div className={cn('space-y-1', props.className)}>
      <div role="group" aria-label={props.label} className={cn('inline-flex items-center rounded-full border border-input bg-background px-0.5', props.compact ? 'h-9' : 'h-10', props.disabled && 'opacity-50')}>
        <Button type="button" variant="ghost" size={buttonSize} aria-label="Mennyiség csökkentése" disabled={props.disabled || current <= 1} onClick={() => commit(current - 1)}>
          <MinusIcon aria-hidden="true" />
        </Button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          aria-label={props.label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={props.disabled}
          value={text}
          onChange={(event) => type(event.target.value)}
          onBlur={() => {
            if (!error) setDraft(null)
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'rounded-full bg-transparent text-center font-semibold tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:text-destructive',
            props.compact ? 'h-7 w-7 text-xs' : 'h-9 w-11 text-sm',
          )}
        />
        <Button type="button" variant="ghost" size={buttonSize} aria-label="Mennyiség növelése" disabled={props.disabled || current >= props.max} onClick={() => commit(current + 1)}>
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
