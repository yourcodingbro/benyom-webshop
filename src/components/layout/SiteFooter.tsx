import Link from 'next/link'
import type React from 'react'

import type { StoreSettings } from '@/types/settings'

type SiteFooterProps = {
  settings: StoreSettings
}

export function SiteFooter(props: SiteFooterProps): React.JSX.Element {
  const { settings } = props
  return (
    <footer className="mt-16 bg-ink text-white/80">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-heading border-l-4 border-brand-red pl-2.5 font-bold tracking-[0.15em] text-white uppercase">{settings.storeName}</p>
          <p className="mt-3 text-sm">Előrendelés online, fizetés személyes átvételkor vagy kiszállításkor. Online fizetés nincs.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white uppercase">Információk</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <Link href="/fizetes-es-szallitas" className="hover:text-white hover:underline">
                Fizetés és szállítás
              </Link>
            </li>
            <li>
              <Link href="/kapcsolat" className="hover:text-white hover:underline">
                Kapcsolat
              </Link>
            </li>
            {settings.pages.map((page) => (
              <li key={page.slug}>
                <Link href={`/oldal/${page.slug}`} className="hover:text-white hover:underline">
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white uppercase">Kapcsolat</h2>
          <address className="mt-3 space-y-1 text-sm not-italic">
            <p>{settings.contact.address}</p>
            <p>{settings.contact.phone}</p>
            <p>{settings.contact.email}</p>
          </address>
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-xs">
        {settings.isSampleContent ? 'Mintaáruház – minden adat fiktív, a rendelések nem valódiak.' : `© ${settings.storeName}`}
      </p>
    </footer>
  )
}
