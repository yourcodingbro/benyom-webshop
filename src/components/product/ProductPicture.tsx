import Image from 'next/image'
import type React from 'react'

import { cn } from '@/lib/utils'

type ProductPictureProps = {
  src: string | null
  alt: string
  sizes: string
  priority?: boolean
  className?: string
}

/** Square product image. Sample SVG placeholders skip optimization; real raster media is optimized by next/image. */
export function ProductPicture(props: ProductPictureProps): React.JSX.Element {
  return (
    <div className={cn('relative aspect-square overflow-hidden rounded-lg bg-muted', props.className)}>
      {props.src ? (
        <Image
          src={props.src}
          alt={props.alt}
          fill
          sizes={props.sizes}
          priority={props.priority}
          unoptimized={props.src.endsWith('.svg')}
          className="object-contain p-4"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nincs kép</div>
      )}
    </div>
  )
}
