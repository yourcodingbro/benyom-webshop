'use client'

import { Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { QuantitySelector } from '@/components/cart/QuantitySelector'
import { ColorSwatch } from '@/components/product/ColorSwatch'
import { ProductPicture } from '@/components/product/ProductPicture'
import { Button } from '@/components/shadcn/button'
import { ORDERABILITY_LABELS } from '@/config/labels'
import { MAX_LINE_QUANTITY } from '@/config/shop'
import { useCart } from '@/hooks/useCart'
import { describeAttributes } from '@/lib/catalog'
import { formatHuf } from '@/lib/format'
import type { QuotedLine } from '@/types/cart'

type CartLinesProps = {
  /** Read-only lines (checkout review) hide the quantity controls. */
  readOnly?: boolean
  onNavigate?: () => void
}

export function CartLines(props: CartLinesProps): React.JSX.Element {
  const cart = useCart()
  const lines = cart.quote?.lines ?? []

  if (cart.hydrated && cart.lines.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">A kosár üres.</p>
  }
  if (!cart.quote) {
    return <p className="py-8 text-center text-muted-foreground" role="status">Árak betöltése…</p>
  }

  return (
    <ul className="divide-y" aria-busy={cart.pending}>
      {lines.map((line: QuotedLine) => (
        <li key={line.sku} className="flex gap-3 py-4">
          <ProductPicture src={line.imageUrl} alt={line.imageAlt} sizes="80px" className="size-20 shrink-0" />
          <div className="min-w-0 flex-1">
            {line.productSlug ? (
              <Link href={`/termek/${line.productSlug}?valtozat=${encodeURIComponent(line.sku)}`} onClick={props.onNavigate} className="font-semibold text-ink hover:underline">
                {line.productName}
              </Link>
            ) : (
              <span className="font-semibold">{line.productName}</span>
            )}
            {line.attributes ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                {line.attributes.colorHex ? <ColorSwatch hex={line.attributes.colorHex} size="xs" /> : null}
                <span>{describeAttributes(line.attributes)}</span>
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">Cikkszám: {line.sku}</p>
            {line.status !== 'ok' ? (
              <p className="mt-1 text-sm font-semibold text-destructive">
                {line.status === 'not_found' ? 'A termék már nem elérhető.' : ORDERABILITY_LABELS[line.orderability ?? 'temporarily_unavailable']} – távolítsa el a rendelés előtt.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {props.readOnly ? (
                <span className="text-sm">{line.quantity} db</span>
              ) : (
                <div className="flex items-start gap-1">
                  <QuantitySelector
                    value={line.quantity}
                    onChange={(value: number | null) => {
                      if (value !== null && value !== line.quantity) void cart.setQuantity(line.sku, value)
                    }}
                    max={MAX_LINE_QUANTITY}
                    label={`${line.productName} mennyisége`}
                    compact
                  />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`${line.productName} eltávolítása`} disabled={cart.pending} onClick={() => void cart.removeItem(line.sku)}>
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
              )}
              <span className="text-right font-semibold text-ink">
                {line.status === 'ok' ? formatHuf(line.lineTotal) : '–'}
                {line.status === 'ok' && line.quantity > 1 ? <span className="block text-xs font-normal text-muted-foreground">{formatHuf(line.unitPrice)} / db</span> : null}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
