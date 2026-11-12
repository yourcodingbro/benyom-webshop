import type React from 'react'

import { isLightColor } from '@/lib/hex'
import { cn } from '@/lib/utils'

type ColorDotProps = {
  hex: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

const SIZES: Record<NonNullable<ColorDotProps['size']>, string> = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-9',
}

/** Square, decorative (non-interactive) color sample for carts and filters. Light colors get a stronger border. Pair with a text label. */
export function ColorDot(props: ColorDotProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-[3px] border', isLightColor(props.hex) ? 'border-neutral-500' : 'border-black/20', SIZES[props.size ?? 'sm'], props.className)}
      style={{ backgroundColor: props.hex }}
    />
  )
}
