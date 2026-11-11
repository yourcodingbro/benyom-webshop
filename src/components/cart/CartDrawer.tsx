'use client'

import { ArrowRightIcon, ShoppingBagIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { CartLines } from '@/components/cart/CartLines'
import { Button } from '@/components/shadcn/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/shadcn/sheet'
import { useCart } from '@/hooks/useCart'
import { formatHuf } from '@/lib/format'

/** Header cart button + slide-in cart drawer. */
export function CartDrawer(): React.JSX.Element {
  const cart = useCart()
  const count = cart.hydrated ? cart.itemCount : 0
  const close = (): void => cart.setDrawerOpen(false)

  return (
    <Sheet open={cart.drawerOpen} onOpenChange={cart.setDrawerOpen}>
      <SheetTrigger className="relative flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10" aria-label={`Kosár megnyitása, ${count} termék`}>
        <ShoppingBagIcon className="size-5" aria-hidden="true" />
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-5 font-bold text-white" aria-hidden="true">
            {count}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kosár</SheetTitle>
          <SheetDescription>Előrendelés – fizetés átvételkor vagy kiszállításkor.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <CartLines onNavigate={close} />
          {cart.error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {cart.error}
            </p>
          ) : null}
        </div>
        {cart.lines.length > 0 ? (
          <SheetFooter className="border-t">
            <div className="flex items-baseline justify-between">
              <span>Termékek összesen</span>
              <span className="text-lg font-bold text-ink">{cart.quote ? formatHuf(cart.quote.itemsTotal) : '…'}</span>
            </div>
            <p className="text-xs text-muted-foreground">A végleges árat és a szállítási díjat a pénztár ellenőrzi. Online fizetés nincs.</p>
            {cart.quote?.hasUnavailable ? (
              <Button size="lg" disabled>
                Távolítsa el a nem rendelhető tételeket
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link href="/penztar" onClick={close}>
                  Tovább a pénztárhoz
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/kosar" onClick={close}>
                Kosár megtekintése
              </Link>
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
