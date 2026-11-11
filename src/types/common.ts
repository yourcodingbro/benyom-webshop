/** UTC timestamp in ISO-8601 format, e.g. 2026-11-11T09:30:00.000Z. */
export type IsoDateTime = string

/** Whole Hungarian forints. HUF has no minor unit in retail use; all arithmetic stays integer. */
export type HufAmount = number

export type Currency = 'HUF'

export type Paginated<T> = {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export type FieldErrors = Record<string, string>
