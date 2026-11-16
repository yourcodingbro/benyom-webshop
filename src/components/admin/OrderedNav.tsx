import { DefaultNav } from '@payloadcms/next/rsc'
import type React from 'react'

import { orderByNavGroup } from '@/collections/utils/nav-groups'

type OrderedNavProps = React.ComponentProps<typeof DefaultNav>

/**
 * Payload's own sidebar (`admin.components.Nav`) with the groups in NAV_GROUP_ORDER. Payload creates a
 * group where its first collection/global appears, so the native nav gets the entities sorted by group;
 * rendering, collapse state, permissions, active links and the mobile menu are all Payload's.
 * shortcut: collections are grouped before globals, so a globals-only group cannot precede a group that
 * has collections; a test asserts the resulting order. Upgrade to a native option if Payload adds one.
 */
export function OrderedNav(props: OrderedNavProps): React.JSX.Element | null {
  const payload = props.payload
  if (!payload?.config) return <DefaultNav {...props} />
  const config = { ...payload.config, collections: orderByNavGroup(payload.config.collections), globals: orderByNavGroup(payload.config.globals) }
  // Keep the real Payload instance (prototype methods) and override only the config the nav reads.
  const ordered: typeof payload = Object.create(payload, { config: { value: config } })
  return <DefaultNav {...props} payload={ordered} />
}
