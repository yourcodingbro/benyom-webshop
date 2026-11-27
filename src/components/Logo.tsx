import Image from 'next/image'
import Link from 'next/link'
import type React from 'react'

import { cn } from '@/lib/utils'
import type { BrandingImage } from '@/types/settings'

type LogoProps = {
  storeName: string
  /** Fejléc beállítások → Logó; null shows the store name as text. */
  logo: BrandingImage | null
  className?: string
}

/**
 * Storefront logo linking home: the uploaded image (fixed height, width from its own proportions), or the text logo in
 * the benyom.hu style (bold Montserrat, letter-spacing, red left bar) when none is set.
 */
export function Logo(props: LogoProps): React.JSX.Element {
  if (props.logo) {
    return (
      <Link href="/" className={cn('inline-flex shrink-0 items-center', props.className)} aria-label={`${props.storeName} – főoldal`}>
        {/* Small branding file served as uploaded (SVG included), so the image optimizer is not involved. */}
        <Image
          src={props.logo.url}
          alt={props.logo.alt || props.storeName}
          width={props.logo.width ?? 160}
          height={props.logo.height ?? 40}
          unoptimized
          priority
          className="h-7 w-auto max-w-[11rem] object-contain sm:h-9 sm:max-w-[14rem]"
        />
      </Link>
    )
  }
  return (
    <Link href="/" className={cn('font-heading border-l-4 border-brand-red pl-2.5 text-base leading-none font-bold tracking-[0.12em] whitespace-nowrap text-white uppercase sm:text-xl', props.className)}>
      {props.storeName}
    </Link>
  )
}
