import type { HufAmount } from '@/types/common'

/** Throws unless the value is a non-negative safe integer number of forints. */
export function assertHuf(value: number): HufAmount {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Érvénytelen forintösszeg: ${value}`)
  }
  return value
}

export function multiplyHuf(unitPrice: HufAmount, quantity: number): HufAmount {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError('Érvénytelen mennyiség')
  return assertHuf(assertHuf(unitPrice) * quantity)
}

export function sumHuf(values: HufAmount[]): HufAmount {
  return assertHuf(values.reduce((total: number, value: number) => total + assertHuf(value), 0))
}
