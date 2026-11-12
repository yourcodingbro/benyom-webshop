export const MAX_PRICE_FILTER: number = 100_000_000

export type PriceRangeCheck =
  | { ok: true; min: number | null; max: number | null }
  | { ok: false; field: 'min' | 'max'; error: string }

function parse(raw: string): number | null | 'invalid' {
  const compact = raw.replace(/[\s.]/g, '')
  if (compact === '') return null
  if (!/^\d+$/.test(compact)) return 'invalid'
  const value = Number(compact)
  return value > MAX_PRICE_FILTER ? 'invalid' : value
}

/**
 * Validates the typed price range. Spaces and dots are allowed as thousand separators
 * ("150 000"); empty means "no limit". Invalid input is reported, never applied.
 */
export function checkPriceRange(minRaw: string, maxRaw: string): PriceRangeCheck {
  const min = parse(minRaw)
  const max = parse(maxRaw)
  if (min === 'invalid') return { ok: false, field: 'min', error: 'A minimum ár csak pozitív egész szám lehet.' }
  if (max === 'invalid') return { ok: false, field: 'max', error: 'A maximum ár csak pozitív egész szám lehet.' }
  if (min !== null && max !== null && min > max) return { ok: false, field: 'max', error: 'A maximum ár nem lehet kisebb a minimumnál.' }
  return { ok: true, min, max }
}
