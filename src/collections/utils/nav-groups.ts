/** Admin sidebar group labels; collections and globals reference these instead of literal strings. */
export const NAV_GROUPS = {
  ORDERS: 'Rendelések',
  STORE: 'Bolt',
  NOTIFICATIONS: 'Értesítések',
  SYSTEM: 'Rendszer',
  SETTINGS: 'Beállítások',
} as const

export type NavGroup = (typeof NAV_GROUPS)[keyof typeof NAV_GROUPS]

/** Sidebar order of the groups. */
export const NAV_GROUP_ORDER: readonly NavGroup[] = [NAV_GROUPS.ORDERS, NAV_GROUPS.STORE, NAV_GROUPS.NOTIFICATIONS, NAV_GROUPS.SYSTEM, NAV_GROUPS.SETTINGS]

type Grouped = { admin?: { group?: unknown } }

/**
 * Stable sort by NAV_GROUP_ORDER (unknown groups last); order within a group is unchanged. Payload
 * creates sidebar groups in the order their first entity appears, so this decides the group order.
 */
export function orderByNavGroup<T extends Grouped>(entities: readonly T[]): T[] {
  const rank = (entity: T): number => {
    const index = NAV_GROUP_ORDER.indexOf(entity.admin?.group as NavGroup)
    return index === -1 ? NAV_GROUP_ORDER.length : index
  }
  return entities.map((entity, position) => ({ entity, position })).sort((a, b) => rank(a.entity) - rank(b.entity) || a.position - b.position).map(({ entity }) => entity)
}
