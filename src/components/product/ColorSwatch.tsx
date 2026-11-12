import { CheckIcon } from 'lucide-react'
import type React from 'react'

import { isLightColor } from '@/lib/hex'
import { cn } from '@/lib/utils'

type ColorSwatchProps = {
  /** Shown as the accessible name and tooltip; the HEX code is used when empty (names are optional in the admin). */
  name: string
  /** HEX color as entered in the admin, e.g. #1F2937. */
  code: string
  selected: boolean
  /** Unavailable: still focusable and announced, but clicking does nothing. */
  disabled?: boolean
  onSelect: (code: string) => void
}

const STRIKE: string =
  'bg-[linear-gradient(to_top_right,transparent_calc(50%-1.5px),#b42318_calc(50%-1.5px),#b42318_calc(50%+1.5px),transparent_calc(50%+1.5px))]'

/**
 * Square, selectable color swatch (presentation and selection only; which colors combine is
 * decided by the caller). A toggle button (`aria-pressed`) that never submits a form. Selected:
 * ring + check; keyboard focus: outline; disabled: dimmed with a red strike. The size comes from
 * the `--swatch-size` custom property on an ancestor (default 2.75rem).
 */
export function ColorSwatch(props: ColorSwatchProps): React.JSX.Element {
  const label = props.name.trim() || props.code
  const light = isLightColor(props.code)
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      // aria-disabled instead of disabled: it stays in the tab order, so the tooltip and state stay discoverable.
      aria-disabled={props.disabled ? true : undefined}
      aria-label={label}
      title={label}
      onClick={() => {
        if (!props.disabled) props.onSelect(props.code)
      }}
      className={cn(
        'relative flex size-[var(--swatch-size,2.75rem)] shrink-0 items-center justify-center overflow-hidden rounded border transition-transform duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
        light ? 'border-neutral-500' : 'border-black/25',
        props.selected && 'ring-2 ring-ink ring-offset-2',
        props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105',
      )}
      style={{ backgroundColor: props.code }}
    >
      {props.selected ? <CheckIcon aria-hidden="true" strokeWidth={3} className={cn('size-1/2', light ? 'text-ink' : 'text-white')} /> : null}
      {props.disabled ? <span aria-hidden="true" className={cn('absolute inset-0', STRIKE)} /> : null}
    </button>
  )
}
