import { describe, expect, it } from 'vitest'

import { checkPriceRange, MAX_PRICE_FILTER } from '@/lib/price-filter'

describe('price filter validation', () => {
  it('accepts empty bounds, plain integers and thousand separators', () => {
    expect(checkPriceRange('', '')).toEqual({ ok: true, min: null, max: null })
    expect(checkPriceRange('150 000', '')).toEqual({ ok: true, min: 150000, max: null })
    expect(checkPriceRange('', '1.000.000')).toEqual({ ok: true, min: null, max: 1000000 })
    expect(checkPriceRange('100000', '100000')).toEqual({ ok: true, min: 100000, max: 100000 })
  })

  it('rejects non-integers, negatives, oversized values and inverted ranges without applying them', () => {
    expect(checkPriceRange('-5', '')).toMatchObject({ ok: false, field: 'min' })
    expect(checkPriceRange('1,5', '')).toMatchObject({ ok: false, field: 'min' })
    expect(checkPriceRange('', 'abc')).toMatchObject({ ok: false, field: 'max' })
    expect(checkPriceRange('', String(MAX_PRICE_FILTER + 1))).toMatchObject({ ok: false, field: 'max' })
    expect(checkPriceRange('500000', '1')).toEqual({ ok: false, field: 'max', error: 'A maximum ár nem lehet kisebb a minimumnál.' })
  })
})
