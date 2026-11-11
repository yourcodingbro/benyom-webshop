import { LOCALE, TIME_ZONE } from '@/config/shop'
import type { HufAmount, IsoDateTime } from '@/types/common'

const hufFormatter: Intl.NumberFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'HUF',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const dateTimeFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/** e.g. "449 990 Ft" (Hungarian grouping uses a narrow no-break space). */
export function formatHuf(amount: HufAmount): string {
  return hufFormatter.format(amount)
}

/** Shown in Europe/Budapest regardless of server time zone. */
export function formatDateTime(value: IsoDateTime): string {
  return dateTimeFormatter.format(new Date(value))
}

export function formatDate(value: IsoDateTime): string {
  return dateFormatter.format(new Date(value))
}
