'use client'

import { CheckIcon } from 'lucide-react'
import type React from 'react'
import { useId } from 'react'

import { VARIANT_DIMENSION_LABELS } from '@/config/labels'
import type { UseVariantSelectionResult } from '@/hooks/useVariantSelection'
import { isLightColor } from '@/lib/hex'
import { cn } from '@/lib/utils'
import { optionLabel, type VariantDimension, type VariantOptionState } from '@/lib/variant-selection'
import type { Product } from '@/types/catalog'

type VariantOptionsProps = {
  product: Product
  selection: UseVariantSelectionResult
  onChoose: (dimension: VariantDimension, value: string | number) => void
  /** Compact sizing for product previews. */
  compact?: boolean
}

const STRIKE: string = 'bg-[linear-gradient(to_top_right,transparent_calc(50%-1.5px),#b42318_calc(50%-1.5px),#b42318_calc(50%+1.5px),transparent_calc(50%+1.5px))]'

/**
 * Native radio groups per variant dimension (keyboard arrows, one tab stop each).
 * Colors are square HEX swatches; selection is shown with a ring and a check icon, unavailable
 * combinations with a strike-through, and every state is also in the accessible name.
 */
export function VariantOptions(props: VariantOptionsProps): React.JSX.Element {
  const groupId = useId()
  const { product, selection, compact } = props
  return (
    <div className={compact ? 'space-y-2' : 'space-y-5'}>
      {selection.dimensions.map((dimension: VariantDimension) => {
        const current = selection.selection[dimension]
        return (
          <fieldset key={dimension}>
            <legend className={cn('font-semibold', compact ? 'mb-1 text-xs' : 'mb-2 text-sm')}>
              {VARIANT_DIMENSION_LABELS[dimension]}:{' '}
              <span className="font-normal">{current !== undefined ? optionLabel(product, dimension, current) : 'válasszon'}</span>
            </legend>
            <div className={cn('flex flex-wrap', compact ? 'gap-1.5' : 'gap-2')}>
              {selection.options(dimension).map((option: VariantOptionState) => {
                const checked = option.value === current
                const unavailable = option.combinable && !option.orderable
                const label = optionLabel(product, dimension, option.value)
                const note = !option.combinable ? ' – más változattal együtt választható' : unavailable ? ' – nem rendelhető' : ''
                const inputId = `${groupId}-${dimension}-${String(option.value).replace('#', '')}`
                const focus = 'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring'
                return (
                  <label key={String(option.value)} htmlFor={inputId} className="relative cursor-pointer" title={`${label}${note}`}>
                    <input
                      id={inputId}
                      type="radio"
                      name={`${groupId}-${dimension}`}
                      value={String(option.value)}
                      checked={checked}
                      onChange={() => props.onChoose(dimension, option.value)}
                      aria-label={`${label}${note}`}
                      className="peer sr-only"
                    />
                    {dimension === 'colorHex' && typeof option.value === 'string' ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'relative flex items-center justify-center rounded-md border-2 transition-transform duration-150 hover:scale-105',
                          compact ? 'size-8' : 'size-11',
                          focus,
                          isLightColor(option.value) ? 'border-neutral-500' : 'border-black/25',
                          checked && 'ring-2 ring-ink ring-offset-2',
                          !option.combinable && 'opacity-50',
                        )}
                        style={{ backgroundColor: option.value }}
                      >
                        {checked ? <CheckIcon className={cn(compact ? 'size-4' : 'size-5', isLightColor(option.value) ? 'text-ink' : 'text-white')} strokeWidth={3} /> : null}
                        {unavailable ? <span className={cn('absolute inset-0', STRIKE)} /> : null}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex items-center justify-center gap-1 rounded-full border-2 transition-colors hover:border-ink',
                          compact ? 'min-h-8 px-2.5 text-xs' : 'min-w-16 px-4 py-2 text-sm',
                          focus,
                          checked ? 'border-ink bg-ink text-white' : 'border-border',
                          !option.combinable && 'border-dashed text-muted-foreground',
                          unavailable && 'line-through',
                        )}
                      >
                        {checked ? <CheckIcon className={compact ? 'size-3' : 'size-4'} /> : null}
                        {label}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
