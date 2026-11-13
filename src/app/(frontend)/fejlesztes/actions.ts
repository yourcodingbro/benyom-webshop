'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { areDevToolsEnabled } from '@/config/runtime'
import { getAdminAuthorization } from '@/dto/auth'
import { schedulerService } from '@/services/schedulerService'

/*
 * Development-only server actions. Each one re-checks APP_ENV (404 in production; server actions are
 * reachable by direct POST, so hiding the page alone is not enough) and requires a signed-in Payload
 * admin. They act on the configured development database only.
 */

async function guard(): Promise<void> {
  if (!areDevToolsEnabled()) notFound()
  if (!(await getAdminAuthorization(await headers()))) redirect('/admin/login?redirect=%2Ffejlesztes')
}

export async function runSchedulerAction(): Promise<void> {
  await guard()
  const run = await schedulerService.runOnce()
  revalidatePath('/fejlesztes')
  const message = `Ütemező lefutott: ${run.emails.processed} e-mail feldolgozva (${run.emails.submitted} átadva, ${run.emails.simulated} naplózva, ${run.emails.failed} sikertelen); ${run.proposals.remindersSent} emlékeztető, ${run.proposals.expired} lejárt ajánlat.`
  redirect(`/fejlesztes?uzenet=${encodeURIComponent(message)}`)
}
