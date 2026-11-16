import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import type React from 'react'

import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm'

/** Admin view (/admin/jelszocsere): mandatory first-login password change for temporary credentials. */
export function ChangePasswordView(props: AdminViewServerProps): React.JSX.Element {
  const { initPageResult, params, searchParams } = props
  const { req, locale, permissions, visibleEntities } = initPageResult
  const user = req.user
  const pending = Boolean(user && user.collection === 'users' && user.mustChangePassword === true)
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
        <h1>Új jelszó beállítása</h1>
        {pending && user?.collection === 'users' ? (
          <ChangePasswordForm email={user.email} />
        ) : (
          <p>Ehhez a fiókhoz nem tartozik ideiglenes jelszó. Jelszavát a fiókbeállításokban módosíthatja.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
