import { ArrowLeftIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type React from 'react'

import { areDevToolsEnabled } from '@/config/runtime'
import { getEmailLogEntry } from '@/dto/email-log'
import { getDevAdminAuthorization } from '@/lib/authorization'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'E-mail előnézet', robots: { index: false, follow: false }, referrer: 'no-referrer' }

type EmailPreviewPageProps = {
  params: Promise<{ id: string }>
}

/** Development-only rendered email preview (may contain working sample decision links). */
export default async function EmailPreviewPage(props: EmailPreviewPageProps): Promise<React.JSX.Element> {
  if (!areDevToolsEnabled()) notFound()
  const entry = await getEmailLogEntry((await props.params).id, getDevAdminAuthorization())
  if (!entry?.preview) notFound()
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
      <Link href="/fejlesztes" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline">
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Vissza a fejlesztői eszközökhöz
      </Link>
      <h1 className="text-2xl font-bold">{entry.subject}</h1>
      <p className="text-sm text-muted-foreground">
        {entry.status === 'sent' ? `Resend által elfogadva (${entry.messageId})` : entry.status === 'sent_simulated' ? 'SZIMULÁLT – nem került kiküldésre' : 'SIKERTELEN küldés'} · {formatDateTime(entry.at)} · címzett: {entry.to} · sablon: {entry.templateId} · állapot: {entry.status}
      </p>
      <iframe title="E-mail HTML előnézet" srcDoc={entry.preview.html} sandbox="allow-popups allow-top-navigation-by-user-activation" className="h-[720px] w-full rounded-xl border bg-white" />
      <details>
        <summary className="cursor-pointer font-semibold">Szöveges változat</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-muted p-4 text-xs whitespace-pre-wrap">{entry.preview.text}</pre>
      </details>
    </div>
  )
}
