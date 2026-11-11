import Link from 'next/link'
import type React from 'react'

export default function NotFound(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p className="font-heading text-6xl font-bold text-brand-red">404</p>
      <h1 className="mt-4 text-2xl font-bold">Az oldal nem található</h1>
      <p className="mt-2 text-muted-foreground">Lehet, hogy a termék már nem elérhető, vagy elírás történt a címben.</p>
      <Link href="/termekek" className="mt-6 inline-block font-semibold text-primary underline">
        Termékek böngészése
      </Link>
    </div>
  )
}
