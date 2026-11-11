'use client'

import { createContext, useContext } from 'react'

import type { CartQuote, StoredCartLine } from '@/types/cart'

/** Outcome of adding to the cart; the message is ready to show to the customer. */
export type AddItemResult = { ok: true; quantityInCart: number } | { ok: false; message: string }

export type UseCartResult = {
  /** Lines persisted in localStorage (SKU, quantity, signed quote token). */
  lines: StoredCartLine[]
  /** Latest server quote; prices shown in the UI always come from here. */
  quote: CartQuote | null
  itemCount: number
  hydrated: boolean
  pending: boolean
  error: string | null
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  /** Adds the exact SKU; an existing line is increased. Prices and orderability are re-checked by the server. */
  addItem: (sku: string, quantity: number) => Promise<AddItemResult>
  setQuantity: (sku: string, quantity: number) => Promise<void>
  removeItem: (sku: string) => Promise<void>
  refresh: () => Promise<void>
  clear: () => void
}

export const CartContext: React.Context<UseCartResult | null> = createContext<UseCartResult | null>(null)

/** Access the shared cart. Must be used below <CartProvider>. */
export function useCart(): UseCartResult {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart csak CartProvider alatt használható.')
  return context
}
