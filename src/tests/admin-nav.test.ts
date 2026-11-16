import { EntityType, groupNavItems } from '@payloadcms/ui/shared'
import type { I18nClient } from '@payloadcms/translations'
import type { SanitizedPermissions } from 'payload'
import { describe, expect, it } from 'vitest'

import { NAV_GROUP_ORDER, NAV_GROUPS, orderByNavGroup } from '@/collections/utils/nav-groups'
import { testPayload } from '@/tests/helpers'

const i18n = { t: (key: string) => key, language: 'hu' } as unknown as I18nClient

/** What the admin sidebar shows: Payload's own grouping over the entities as OrderedNav passes them. */
async function sidebar(hidden: string[] = []): Promise<{ label: string; slugs: string[] }[]> {
  const { config } = await testPayload()
  const visible = <T extends { slug: string; admin?: { hidden?: unknown } }>(entity: T): boolean => entity.admin?.hidden !== true && !entity.slug.startsWith('payload-')
  const permissions = {
    collections: Object.fromEntries(config.collections.map((c) => [c.slug, { read: !hidden.includes(c.slug) }])),
    globals: Object.fromEntries(config.globals.map((g) => [g.slug, { read: !hidden.includes(g.slug) }])),
  } as unknown as SanitizedPermissions
  const groups = groupNavItems(
    [
      ...orderByNavGroup(config.collections.filter(visible)).map((entity) => ({ type: EntityType.collection as const, entity })),
      ...orderByNavGroup(config.globals.filter(visible)).map((entity) => ({ type: EntityType.global as const, entity })),
    ],
    permissions,
    i18n,
  )
  return groups.map((group) => ({ label: String(group.label), slugs: group.entities.map((entity) => entity.slug) }))
}

describe('admin sidebar groups', () => {
  it('shows the groups in the defined order, all labels from NAV_GROUPS', async () => {
    const groups = await sidebar()
    expect(groups.map((group) => group.label)).toEqual([...NAV_GROUP_ORDER])
    expect(Object.values(NAV_GROUPS).sort()).toEqual([...NAV_GROUP_ORDER].sort())
    // Order inside a group stays the registration order.
    expect(groups.find((group) => group.label === NAV_GROUPS.STORE)?.slugs).toEqual(['brands', 'categories', 'products'])
    expect(groups.find((group) => group.label === NAV_GROUPS.SYSTEM)?.slugs).toEqual(['media', 'users', 'import-jobs'])
    expect(groups.find((group) => group.label === NAV_GROUPS.NOTIFICATIONS)?.slugs).toEqual(['email-messages', 'email-events', 'contact-messages'])
  })

  it('keeps permission-based visibility: a group without readable entries disappears, the order stays', async () => {
    const groups = await sidebar(['users', 'media', 'import-jobs', 'orders'])
    expect(groups.map((group) => group.label)).toEqual(NAV_GROUP_ORDER.filter((label) => label !== NAV_GROUPS.SYSTEM))
    expect(groups.find((group) => group.label === NAV_GROUPS.ORDERS)?.slugs).not.toContain('orders')
  })

  it('sorts stably and puts unknown groups last', () => {
    const entities = [{ admin: { group: 'Más' } }, { admin: { group: NAV_GROUPS.SETTINGS } }, { admin: { group: NAV_GROUPS.ORDERS } }, { admin: { group: NAV_GROUPS.SETTINGS } }]
    expect(orderByNavGroup(entities)).toEqual([entities[2], entities[1], entities[3], entities[0]])
  })
})
