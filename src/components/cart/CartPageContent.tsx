'use client'

import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { CartLines, CartLinesSkeleton } from '@/components/cart/CartLines'
import { Button } from '@/components/shadcn/button'
import { useCart } from '@/hooks/useCart'
import { formatHuf } from '@/lib/format'
import { Skeleton } from '@/components/shadcn/skeleton'

export function CartPageContent(): React.JSX.Element {
  const cart = useCart()
  const empty = cart.hydrated && cart.lines.length === 0
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="rounded-xl border px-4">
        <CartLines />
        {empty ? (
          <p className="pb-8 text-center">
            <Link href="/termekek" className="font-semibold text-primary underline">
              Termékek böngészése
            </Link>
          </p>
        ) : null}
      </div>
      {!empty ? (
        <aside className="h-fit space-y-3 rounded-xl bg-muted p-5" aria-label="Összesítő">
          <div className="flex items-baseline justify-between">
            <span>Termékek összesen</span>
            <strong className="text-lg text-ink">{cart.quote ? formatHuf(cart.quote.itemsTotal) : '…'}</strong>
          </div>
          <p className="text-sm text-muted-foreground">A szállítási díjat a pénztárban választott mód határozza meg. Fizetés átvételkor vagy kiszállításkor – online fizetés nincs.</p>
          {cart.error ? (
            <p className="text-sm text-destructive" role="alert">
              {cart.error}
            </p>
          ) : null}
          {cart.quote?.hasUnavailable ? (
            <Button disabled className="w-full">
              Távolítsa el a nem rendelhető tételeket
            </Button>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href="/penztar">
                Tovább a pénztárhoz
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          )}
        </aside>
      ) : null}
    </div>
  )
}

/** CartPageContent placeholder: the lines panel and the summary aside, in the same two-column grid. */
export function CartPageContentSkeleton(): React.JSX.Element {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]" aria-hidden="true">
      <div className="rounded-xl border px-4">
        <CartLinesSkeleton rows={2} />
      </div>
      <div className="h-fit space-y-3 rounded-xl bg-muted p-5">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-5 w-24 bg-background/70" />
          <Skeleton className="h-6 w-28 bg-background/70" />
        </div>
        <Skeleton className="h-4 w-full bg-background/70" />
        <Skeleton className="h-4 w-4/5 bg-background/70" />
        <Skeleton className="h-11 w-full rounded-full bg-background/70" />
      </div>
    </div>
  )
}
