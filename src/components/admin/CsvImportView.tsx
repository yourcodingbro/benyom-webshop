import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import type React from 'react'

import { CsvImportClient } from '@/components/admin/CsvImportClient'

/** Payload admin view (/admin/termekimport): CSV product import with dry-run preview. Admin only. */
export function CsvImportView(props: AdminViewServerProps): React.JSX.Element {
  const { initPageResult, params, searchParams } = props
  const { req, locale, permissions, visibleEntities } = initPageResult
  const user = req.user
  const isAdmin = Boolean(user && user.collection === 'users' && Array.isArray(user.roles) && user.roles.includes('admin'))
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <h1>Termékimport (CSV)</h1>
        {isAdmin ? <CsvImportClient /> : <p>Ehhez az oldalhoz adminisztrátori bejelentkezés szükséges.</p>}
      </Gutter>
    </DefaultTemplate>
  )
}
