'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { quoteCartAction } from '@/app/(frontend)/actions'
import { CART_STORAGE_KEY, MAX_CART_LINES, MAX_LINE_QUANTITY } from '@/config/shop'
import { type AddItemResult, CartContext, type UseCartResult } from '@/hooks/useCart'
import type { CartQuote, StoredCartLine } from '@/types/cart'

type CartProviderProps = {
  children: React.ReactNode
}

function readStoredLines(): StoredCartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item: unknown): item is StoredCartLine => {
        if (!item || typeof item !== 'object') return false
        const record = item as Record<string, unknown>
        return typeof record.sku === 'string' && typeof record.quantity === 'number' && (record.quoteToken === null || typeof record.quoteToken === 'string')
      })
      .slice(0, MAX_CART_LINES)
  } catch {
    return []
  }
}

function writeStoredLines(lines: StoredCartLine[]): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines))
  } catch {
    // Storage may be unavailable (private mode); the cart then lasts for this page view only.
  }
}

function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.round(quantity), 1), MAX_LINE_QUANTITY)
}

/** Browser cart persisted in localStorage; every price shown is re-quoted by the server. */
export function CartProvider(props: CartProviderProps): React.JSX.Element {
  const [lines, setLines] = useState<StoredCartLine[]>([])
  const [quote, setQuote] = useState<CartQuote | null>(null)
  const [hydrated, setHydrated] = useState<boolean>(false)
  const [pending, setPending] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const requestId = useRef<number>(0)

  /** New server quote, an error message, or null when a newer request superseded this one. */
  const requote = useCallback(async (next: StoredCartLine[]): Promise<CartQuote | string | null> => {
    const id = ++requestId.current
    setPending(true)
    try {
      const result = await quoteCartAction(next)
      if (id !== requestId.current) return null
      if (!result.ok) {
        setError(result.message)
        return result.message
      }
      const withTokens = next.map((line: StoredCartLine) => ({
        ...line,
        quoteToken: result.quote.lines.find((quoted) => quoted.sku === line.sku)?.quoteToken ?? line.quoteToken,
      }))
      setLines(withTokens)
      writeStoredLines(withTokens)
      setQuote(result.quote)
      setError(null)
      return result.quote
    } catch {
      if (id !== requestId.current) return null
      const message = 'Az árak frissítése nem sikerült. Ellenőrizze a kapcsolatot.'
      setError(message)
      return message
    } finally {
      if (id === requestId.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    // One-time hydration from localStorage after SSR; reading storage during render would cause a hydration mismatch.
    const stored = readStoredLines()
    /* eslint-disable react-hooks/set-state-in-effect */
    setLines(stored)
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    if (stored.length > 0) void requote(stored)
  }, [requote])

  const addItem = useCallback(
    async (sku: string, quantity: number): Promise<AddItemResult> => {
      if (!Number.isSafeInteger(quantity) || quantity < 1) return { ok: false, message: 'A mennyiség pozitív egész szám legyen.' }
      const existing = lines.find((line: StoredCartLine) => line.sku === sku)
      if (!existing && lines.length >= MAX_CART_LINES) return { ok: false, message: `Legfeljebb ${MAX_CART_LINES} tétel lehet a kosárban.` }
      const total = (existing?.quantity ?? 0) + quantity
      // Per-line order cap (not a stock limit): report it instead of silently clamping.
      if (total > MAX_LINE_QUANTITY) {
        const inCart = existing ? ` (a kosárban már ${existing.quantity} db van)` : ''
        return { ok: false, message: `Tételenként legfeljebb ${MAX_LINE_QUANTITY} db rendelhető${inCart}.` }
      }
      const next = existing
        ? lines.map((line: StoredCartLine) => (line.sku === sku ? { ...line, quantity: total } : line))
        : [...lines, { sku, quantity, quoteToken: null }]
      const result = await requote(next)
      if (result === null) return { ok: false, message: 'A kosár időközben megváltozott. Próbálja újra.' }
      if (typeof result === 'string') return { ok: false, message: result }
      if (result.lines.find((line) => line.sku === sku)?.status !== 'ok') {
        // The server refused the variant: restore the previous cart.
        await requote(lines)
        setError('Ez a változat jelenleg nem rendelhető.')
        return { ok: false, message: 'Ez a változat jelenleg nem rendelhető.' }
      }
      setDrawerOpen(true)
      return { ok: true, quantityInCart: total }
    },
    [lines, requote],
  )

  const setQuantity = useCallback(
    async (sku: string, quantity: number): Promise<void> => {
      await requote(lines.map((line: StoredCartLine) => (line.sku === sku ? { ...line, quantity: clampQuantity(quantity) } : line)))
    },
    [lines, requote],
  )

  const removeItem = useCallback(
    async (sku: string): Promise<void> => {
      const next = lines.filter((line: StoredCartLine) => line.sku !== sku)
      if (next.length === 0) {
        setLines([])
        writeStoredLines([])
        setQuote(null)
        return
      }
      await requote(next)
    },
    [lines, requote],
  )

  const clear = useCallback((): void => {
    requestId.current += 1
    setLines([])
    setQuote(null)
    writeStoredLines([])
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (lines.length > 0) await requote(lines)
  }, [lines, requote])

  const value = useMemo<UseCartResult>(
    () => ({
      lines,
      quote,
      itemCount: lines.reduce((total: number, line: StoredCartLine) => total + line.quantity, 0),
      hydrated,
      pending,
      error,
      drawerOpen,
      setDrawerOpen,
      addItem,
      setQuantity,
      removeItem,
      refresh,
      clear,
    }),
    [lines, quote, hydrated, pending, error, drawerOpen, addItem, setQuantity, removeItem, refresh, clear],
  )

  return <CartContext.Provider value={value}>{props.children}</CartContext.Provider>
}
