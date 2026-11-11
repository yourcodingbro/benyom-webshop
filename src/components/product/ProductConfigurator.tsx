'use client'

import { motion } from 'framer-motion'
import { ShoppingCartIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import type React from 'react'
import { useId, useState } from 'react'

import { OrderabilityBadge } from '@/components/product/OrderabilityBadge'
import { ProductPicture } from '@/components/product/ProductPicture'
import { VariantOptions } from '@/components/product/VariantOptions'
import { Button } from '@/components/shadcn/button'
import { MAX_LINE_QUANTITY } from '@/config/shop'
import { useCart } from '@/hooks/useCart'
import { useVariantSelection } from '@/hooks/useVariantSelection'
import { describeAttributes, effectiveOrderability } from '@/lib/catalog'
import { formatHuf } from '@/lib/format'
import type { VariantDimension } from '@/lib/variant-selection'
import type { Product } from '@/types/catalog'

type ProductConfiguratorProps = {
  product: Product
  initialSku: string
}

/** Product page purchase panel. Always shows a complete, existing variant; mirrored in ?valtozat= for sharing. */
export function ProductConfigurator(props: ProductConfiguratorProps): React.JSX.Element {
  const { product } = props
  const router = useRouter()
  const pathname = usePathname()
  const cart = useCart()
  const quantityId = useId()
  const variants = useVariantSelection({ product, initialSku: props.initialSku, autoComplete: true })
  const [quantity, setQuantity] = useState<number>(1)
  const [adding, setAdding] = useState<boolean>(false)
  const [message, setMessage] = useState<string | null>(null)

  const selected = variants.selectedVariant
  if (!selected) return <p>Ehhez a termékhez nincs rendelhető változat.</p>
  const orderability = effectiveOrderability(product, selected)
  const image = variants.image
  const estimate = selected.procurementEstimate ?? product.procurementEstimate

  const choose = (dimension: VariantDimension, value: string | number): void => {
    const next = variants.choose(dimension, value)
    setMessage(null)
    if (next) router.replace(`${pathname}?valtozat=${encodeURIComponent(next.sku)}`, { scroll: false })
  }

  const addToCart = async (): Promise<void> => {
    setAdding(true)
    setMessage(null)
    const ok = await cart.addItem(selected.sku, quantity)
    setAdding(false)
    if (!ok) setMessage(cart.error ?? 'A termék nem tehető a kosárba.')
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <motion.div key={image?.url ?? 'nincs'} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        <ProductPicture src={image?.url ?? null} alt={image?.alt ?? product.name} sizes="(min-width: 768px) 50vw, 100vw" priority />
      </motion.div>

      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{product.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {describeAttributes(selected.attributes)} · Cikkszám: {selected.sku}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-3xl font-bold text-ink">{formatHuf(selected.price)}</p>
          <OrderabilityBadge orderability={orderability} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Bruttó ár. Előrendelés – fizetés személyes átvételkor vagy kiszállításkor.</p>

        <div className="mt-6">
          <VariantOptions product={product} selection={variants} onChoose={choose} />
        </div>

        {estimate && orderability === 'preorderable' ? (
          <p className="mt-5 text-sm">
            Várható beszerzési idő: <strong>{estimate.minDays}–{estimate.maxDays} munkanap</strong> (becslés, nem garantált).
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={quantityId} className="mb-1 block text-sm font-semibold">
              Mennyiség
            </label>
            <select id={quantityId} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="h-10 rounded-md border border-input bg-white px-3">
              {Array.from({ length: MAX_LINE_QUANTITY }, (_: unknown, index: number) => index + 1).map((value: number) => (
                <option key={value} value={value}>
                  {value} db
                </option>
              ))}
            </select>
          </div>
          <Button size="lg" className="min-w-52" disabled={orderability !== 'preorderable' || adding || !cart.hydrated} onClick={() => void addToCart()}>
            <ShoppingCartIcon aria-hidden="true" />
            {orderability !== 'preorderable' ? 'Nem rendelhető' : adding ? 'Hozzáadás…' : 'Kosárba – előrendelés'}
          </Button>
        </div>
        {message ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
