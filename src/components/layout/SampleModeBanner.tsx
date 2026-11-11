import Link from 'next/link'
import type React from 'react'

import { areDevToolsEnabled } from '@/config/runtime'

/** Always-visible notice: this storefront runs on sample data and accepts no real orders. */
export function SampleModeBanner(): React.JSX.Element {
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950 sm:text-sm">
      <strong>Minta mód:</strong> fiktív adatok, adatbázis nélkül – a leadott rendelések nem valódiak, e-mail nem kerül kiküldésre.
      {areDevToolsEnabled() ? (
        <>
          {' '}
          <Link href="/fejlesztes" className="font-semibold underline">
            Fejlesztői eszközök
          </Link>
        </>
      ) : null}
    </div>
  )
}
