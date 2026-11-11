import type React from 'react'

import { isLightColor } from '@/lib/hex'
import { cn } from '@/lib/utils'

type ColorSwatchProps = {
  hex: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

const SIZES: Record<NonNullable<ColorSwatchProps['size']>, string> = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-9',
}

/** Square, decorative color sample. Light colors get a stronger border. Pair with a text label. */
export function ColorSwatch(props: ColorSwatchProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-[3px] border', isLightColor(props.hex) ? 'border-neutral-500' : 'border-black/20', SIZES[props.size ?? 'sm'], props.className)}
      style={{ backgroundColor: props.hex }}
    />
  )
}
