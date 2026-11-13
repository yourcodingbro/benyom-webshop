type ClockState = {
  /** Fixed time for tests; when null the real time plus offset is used. */
  fixed: number | null
  offsetMs: number
}

type Clock = {
  now: () => Date
  nowIso: () => string
  advance: (ms: number) => void
  set: (date: Date) => void
  reset: () => void
  offsetMs: () => number
}

const CLOCK_KEY: unique symbol = Symbol.for('benyom.clock')
type ClockGlobal = typeof globalThis & { [CLOCK_KEY]?: ClockState }

function state(): ClockState {
  const holder = globalThis as ClockGlobal
  holder[CLOCK_KEY] ??= { fixed: null, offsetMs: 0 }
  return holder[CLOCK_KEY]
}

/**
 * Controllable clock. All business rules read time from here so tests and the
 * development time simulator can move time without touching the system clock.
 */
export const clock: Clock = {
  now(): Date {
    const current = state()
    return new Date(current.fixed ?? Date.now() + current.offsetMs)
  },
  nowIso(): string {
    return clock.now().toISOString()
  },
  advance(ms: number): void {
    const current = state()
    if (current.fixed !== null) current.fixed += ms
    else current.offsetMs += ms
  },
  set(date: Date): void {
    state().fixed = date.getTime()
  },
  reset(): void {
    const current = state()
    current.fixed = null
    current.offsetMs = 0
  },
  offsetMs(): number {
    const current = state()
    return current.fixed === null ? current.offsetMs : current.fixed - Date.now()
  },
}

export const HOUR_MS: number = 60 * 60 * 1000

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * HOUR_MS).toISOString()
}
