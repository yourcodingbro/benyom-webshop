'use client'

import { CheckIcon, ShoppingCartIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'
import { useState } from 'react'

import { OrderabilityBadge } from '@/components/product/OrderabilityBadge'
import { ProductPicture } from '@/components/product/ProductPicture'
import { VariantOptions } from '@/components/product/VariantOptions'
import { Button } from '@/components/shadcn/button'
import { VARIANT_DIMENSION_LABELS } from '@/config/labels'
import { useCart } from '@/hooks/useCart'
import { useVariantSelection } from '@/hooks/useVariantSelection'
import { describeAttributes, effectiveOrderability } from '@/lib/catalog'
import { formatHuf } from '@/lib/format'
import type { VariantDimension } from '@/lib/variant-selection'
import type { Orderability, Product } from '@/types/catalog'

type ProductCardProps = {
  product: Product
  brandName: string
  priority?: boolean
}

type Feedback = { kind: 'success' | 'error'; text: string } | null

function overallOrderability(product: Product): Orderability {
  if (product.orderability !== 'preorderable') return product.orderability
  return product.variants.some((variant) => variant.orderability === 'preorderable') ? 'preorderable' : 'temporarily_unavailable'
}

/**
 * Compact product preview with quick add-to-cart. The customer must choose every variant
 * dimension (nothing is preselected unless the product has a single option); the exact
 * resolved variant is added. Controls sit above the stretched title link so they never navigate.
 */
export function ProductCard(props: ProductCardProps): React.JSX.Element {
  const { product } = props
  const cart = useCart()
  const variants = useVariantSelection({ product, initialSku: null, autoComplete: false })
  const [adding, setAdding] = useState<boolean>(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const selected = variants.selectedVariant
  const orderability = selected ? effectiveOrderability(product, selected) : overallOrderability(product)
  const price = selected ? { min: selected.price, max: selected.price } : variants.price

  const choose = (dimension: VariantDimension, value: string | number): void => {
    variants.choose(dimension, value)
    setFeedback(null)
  }

  const addToCart = async (): Promise<void> => {
    if (!selected) {
      setFeedback({ kind: 'error', text: `Válassza ki: ${variants.missing.map((dimension) => VARIANT_DIMENSION_LABELS[dimension].toLowerCase()).join(', ')}.` })
      return
    }
    setAdding(true)
    setFeedback(null)
    const ok = await cart.addItem(selected.sku, 1)
    setAdding(false)
    setFeedback(ok ? { kind: 'success', text: `Kosárba téve: ${describeAttributes(selected.attributes) || product.name}` } : { kind: 'error', text: cart.error ?? 'A termék nem tehető a kosárba.' })
  }

  return (
    <article className="group relative flex h-full flex-col rounded-xl border bg-card p-3 transition-shadow duration-200 hover:shadow-lg focus-within:shadow-lg">
      <ProductPicture
        src={variants.image?.url ?? null}
        alt={variants.image?.alt ?? product.name}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
        priority={props.priority}
        className="transition-transform duration-300 group-hover:scale-[1.01]"
      />
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{props.brandName}</p>
        <h3 className="text-base leading-snug font-semibold">
          <Link
            href={selected ? `/termek/${product.slug}?valtozat=${encodeURIComponent(selected.sku)}` : `/termek/${product.slug}`}
            className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-ring"
          >
            {product.name}
          </Link>
        </h3>
        <div className="flex flex-wrap items-end justify-between gap-2" aria-live="polite">
          {price ? (
            <p className="text-lg font-bold text-ink">
              {price.min !== price.max ? <span className="text-sm font-normal text-muted-foreground">már </span> : null}
              {formatHuf(price.min)}
              {price.min !== price.max ? <span className="text-sm font-normal text-muted-foreground">-tól</span> : null}
            </p>
          ) : null}
          <OrderabilityBadge orderability={orderability} />
        </div>

        {/* z-10 lifts the controls above the stretched link overlay. */}
        <div className="relative z-10 mt-auto space-y-2 pt-1">
          <VariantOptions product={product} selection={variants} onChoose={choose} compact />
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!cart.hydrated || adding || orderability !== 'preorderable'}
            onClick={() => void addToCart()}
            aria-label={orderability === 'preorderable' && !adding ? `${product.name} kosárba` : undefined}
          >
            <ShoppingCartIcon aria-hidden="true" />
            {orderability !== 'preorderable' ? 'Nem rendelhető' : adding ? 'Hozzáadás…' : 'Kosárba'}
          </Button>
          <p className="min-h-4 text-xs" role={feedback?.kind === 'error' ? 'alert' : 'status'}>
            {feedback ? (
              <span className={feedback.kind === 'error' ? 'text-destructive' : 'inline-flex items-center gap-1 text-emerald-800'}>
                {feedback.kind === 'success' ? <CheckIcon className="size-3.5" aria-hidden="true" /> : null}
                {feedback.text}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </article>
  )
}
