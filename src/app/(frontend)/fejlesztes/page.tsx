import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type React from 'react'

import { runSchedulerAction } from '@/app/(frontend)/fejlesztes/actions'
import { Button } from '@/components/shadcn/button'
import { getEmailConfig } from '@/config/email'
import { getAppEnv } from '@/config/env'
import { areDevToolsEnabled } from '@/config/runtime'
import { getAdminAuthorization } from '@/dto/auth'

export const metadata: Metadata = { title: 'Fejlesztői eszközök', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type DevToolsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Development-only helpers (404 when APP_ENV=production or invalid; admin sign-in required).
 * Operational work (orders, proposals, CSV import, email history, notification settings) lives in the
 * Payload admin. Only a manual scheduler run remains here, for development databases without cron.
 */
export default async function DevToolsPage(props: DevToolsPageProps): Promise<React.JSX.Element> {
  if (!areDevToolsEnabled()) notFound()
  if (!(await getAdminAuthorization(await headers()))) redirect('/admin/login?redirect=%2Ffejlesztes')
  const searchParams = await props.searchParams
  const message = typeof searchParams.uzenet === 'string' ? searchParams.uzenet : null
  const emailMode = getEmailConfig().mode

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold">Fejlesztői eszközök</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Környezet: <strong>{getAppEnv()}</strong> · E-mail mód: <strong>{emailMode}</strong>. Éles környezetben (APP_ENV=production) ez az oldal és műveletei 404-et adnak.
        </p>
      </div>
      {message ? (
        <p role="status" className="rounded-md bg-amber-100 px-4 py-2 text-sm">
          {message}
        </p>
      ) : null}
      <section className="rounded-xl border p-5">
        <h2 className="mb-2 text-lg font-bold">Ütemező kézi futtatása</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Ugyanaz a feldolgozás, amit élesben a Vercel cron percenként futtat: esedékes e-mailek (újrapróbálással), árváltozási emlékeztetők és lejáratok. A demó adatokat nem érinti.
        </p>
        <form action={runSchedulerAction}>
          <Button type="submit">Ütemező futtatása most</Button>
        </form>
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="mb-2 text-lg font-bold">Üzemeltetés az admin felületen</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            <Link className="underline" href="/admin/collections/orders">
              Rendelések, állapotváltás, törlés, árváltozási ajánlat, napló
            </Link>
          </li>
          <li>
            <Link className="underline" href="/admin/termekimport">
              Termékimport (CSV)
            </Link>
          </li>
          <li>
            <Link className="underline" href="/admin/collections/email-messages">
              E-mail előzmények és újraküldés
            </Link>
          </li>
          <li>
            <Link className="underline" href="/admin/globals/notification-settings">
              Értesítési beállítások
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}
