/** Static storefront configuration shared by server and browser code. */
export const LOCALE: string = 'hu-HU'
export const TIME_ZONE: string = 'Europe/Budapest'
export const CURRENCY = 'HUF' as const
export const PRODUCT_PAGE_SIZE: number = 12
export const MAX_LINE_QUANTITY: number = 5
export const MAX_CART_LINES: number = 20
/** How long a server-issued cart price quote stays valid. */
export const QUOTE_TTL_HOURS: number = 72
/** Customer response window after the proposal email is successfully sent. */
export const PROPOSAL_REMINDER_AFTER_HOURS: number = 24
/** Final response window after the reminder email is successfully sent. */
export const PROPOSAL_FINAL_WINDOW_HOURS: number = 24
/** An email claim older than this is treated as interrupted and may be retried. */
export const EMAIL_CLAIM_STALE_MINUTES: number = 10
export const CART_STORAGE_KEY: string = 'benyom-kosar-v1'
export const ORDER_ACCESS_COOKIE: string = 'benyom_rendeles'
