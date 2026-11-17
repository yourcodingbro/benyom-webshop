import { Logo } from '@payloadcms/next/rsc'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { getSafeRedirect } from 'payload/shared'
import type React from 'react'

import { AdminLoginForm } from '@/components/admin/AdminLoginForm'

/**
 * Replaces Payload's login view (`admin.components.views.login`) only to show a "Bejelentkezés…" pending
 * state; Payload still renders it in its minimal template. Same behaviour as the native view: a signed-in
 * user is redirected, and the post-login target comes from Payload's getSafeRedirect.
 */
export function AdminLoginView(props: AdminViewServerProps): React.JSX.Element {
  const { initPageResult, params, searchParams } = props
  const { locale, permissions, req } = initPageResult
  const adminRoute = req.payload.config.routes.admin
  const target = getSafeRedirect({ fallbackTo: adminRoute, redirectTo: typeof searchParams?.redirect === 'string' ? searchParams.redirect : '' })
  if (req.user) redirect(target)
  return (
    <>
      <div className="login__brand">
        <Logo i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} searchParams={searchParams} user={req.user ?? undefined} />
      </div>
      <AdminLoginForm redirect={target} forgotHref={`${adminRoute}/forgot`} />
    </>
  )
}
