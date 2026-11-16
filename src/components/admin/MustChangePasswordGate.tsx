'use client'

import { useAuth } from '@payloadcms/ui'
import { usePathname, useRouter } from 'next/navigation'
import type React from 'react'
import { useEffect } from 'react'

type MustChangePasswordGateProps = {
  children: React.ReactNode
}

const ALLOWED: readonly string[] = ['/admin/jelszocsere', '/admin/logout', '/admin/login']

/**
 * Convenience only: sends an admin with a temporary password to the password-change screen. The actual
 * restriction is enforced on the server (access control, endpoints, server actions refuse the user).
 */
export function MustChangePasswordGate(props: MustChangePasswordGateProps): React.JSX.Element {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const mustChange = Boolean(user && 'mustChangePassword' in user && user.mustChangePassword === true)

  useEffect(() => {
    if (mustChange && !ALLOWED.some((path: string) => pathname.startsWith(path))) router.replace('/admin/jelszocsere')
  }, [mustChange, pathname, router])

  return <>{props.children}</>
}
