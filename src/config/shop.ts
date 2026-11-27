import type { ProductSort } from '@/types/catalog'

/** Static storefront configuration shared by server and browser code. */
export const LOCALE: string = 'hu-HU'
export const TIME_ZONE: string = 'Europe/Budapest'
export const CURRENCY = 'HUF' as const
/**
 * Technical ceilings (code-managed). The business limits themselves are set in Áruház beállítások → Üzleti szabályok
 * (maximum quantity per line, maximum distinct lines, price-change response periods) and may not exceed these.
 * The static request schemas use these ceilings; services check the configured limits (src/lib/cart-limits.ts).
 */
export const TECHNICAL_LIMITS = { maxLineQuantity: 99, maxCartLines: 100, maxResponseHours: 336 } as const
/** Bounds of the homepage featured-products grid (Áruház beállítások → Főoldal → Kiemelt termékek). */
export const FEATURED_GRID_LIMITS = { maxCount: 24, minColumns: 2, maxColumns: 4, maxRows: 6 } as const
/** How long a server-issued cart price quote stays valid. */
export const QUOTE_TTL_HOURS: number = 72
/** An email claim older than this is treated as interrupted and may be retried. */
export const EMAIL_CLAIM_STALE_MINUTES: number = 10
export const CART_STORAGE_KEY: string = 'benyom-kosar-v1'
export const ORDER_ACCESS_COOKIE: string = 'benyom_rendeles'
/** Listing order when none is chosen ("Kiemelt": featured first, then name, then id). */
export const DEFAULT_PRODUCT_SORT: ProductSort = 'featured'
/** Debounce for live product search. */
export const SEARCH_DEBOUNCE_MS: number = 300
