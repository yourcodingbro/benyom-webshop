import Link from 'next/link'
import type React from 'react'

type LogoProps = {
  storeName: string
}

/** Text logo in the benyom.hu style: bold Montserrat, letter-spacing, red left bar. */
export function Logo(props: LogoProps): React.JSX.Element {
  return (
    <Link href="/" className="font-heading border-l-4 border-brand-red pl-2.5 text-base leading-none font-bold tracking-[0.12em] whitespace-nowrap text-white uppercase sm:text-xl">
      {props.storeName}
    </Link>
  )
}
