/** URL/storage-safe slug: lowercase ASCII, digits and dashes (Hungarian accents folded). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function isValidSlug(input: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input) && input.length <= 80
}

export type SlugSyncState = { lastGenerated: string | null; previousValue: string }

export type SlugSyncResult = { state: SlugSyncState; setValue: string | null; stopFollowing: boolean }

/**
 * Live slug in the product create form, decided after each change: while following, the slug takes the
 * slugified name; a value that changes to anything not generated here (typed by the admin) stops
 * following. Pure, so the form component and the tests share it.
 */
export function syncSlug(state: SlugSyncState, current: string, name: string, following: boolean): SlugSyncResult {
  const generated = slugify(name)
  const changed = current !== state.previousValue
  const next: SlugSyncState = { ...state, previousValue: current }
  if (!following) return { state: next, setValue: null, stopFollowing: false }
  if (changed && current !== state.lastGenerated) return { state: next, setValue: null, stopFollowing: true }
  if (generated === state.lastGenerated) return { state: next, setValue: null, stopFollowing: false }
  return { state: { ...next, lastGenerated: generated }, setValue: current === generated ? null : generated, stopFollowing: false }
}
