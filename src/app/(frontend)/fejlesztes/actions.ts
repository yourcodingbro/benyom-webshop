'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getDevAdminAuthorization } from '@/lib/authorization'
import { isAppError } from '@/lib/errors'
import { importService, MAX_CSV_BYTES } from '@/services/importService'
import { orderService } from '@/services/orderService'
import { priceChangeService } from '@/services/priceChangeService'
import { simulationService } from '@/services/simulationService'
import { isFulfillmentStatus } from '@/config/labels'
import type { ImportReport } from '@/types/import'

/*
 * Development-only server actions. Each one obtains the sample admin context through
 * getDevAdminAuthorization(), which throws whenever dev tools are disabled (always in production).
 */

function done(message: string): never {
  revalidatePath('/', 'layout')
  redirect(`/fejlesztes?uzenet=${encodeURIComponent(message)}`)
}

async function attempt(work: () => Promise<string> | string): Promise<never> {
  let message: string
  try {
    message = await work()
  } catch (error: unknown) {
    if (!isAppError(error)) throw error
    message = `Hiba: ${error.message}`
  }
  done(message)
}

export async function advanceClockAction(formData: FormData): Promise<void> {
  getDevAdminAuthorization()
  const hours = Number(formData.get('hours'))
  await attempt(() => {
    simulationService.advanceClock(hours)
    return `Az idő ${hours} órával előre léptetve.`
  })
}

export async function resetClockAction(): Promise<void> {
  getDevAdminAuthorization()
  await attempt(() => {
    simulationService.resetClock()
    return 'A szimulált idő visszaállítva a valós időre.'
  })
}

export async function emailFailureAction(formData: FormData): Promise<void> {
  getDevAdminAuthorization()
  const mode = String(formData.get('mode'))
  await attempt(() => {
    simulationService.setEmailFailure(mode === 'fail-all' ? { kind: 'fail-all' } : mode === 'fail-next' ? { kind: 'fail-next', remaining: 1 } : { kind: 'none' })
    return 'E-mail hibaszimuláció beállítva.'
  })
}

export async function runSchedulerAction(): Promise<void> {
  getDevAdminAuthorization()
  await attempt(async () => {
    const report = await simulationService.runScheduler()
    return `Ütemező lefutott: ${report.proposalEmailsSent} ajánlat, ${report.remindersSent} emlékeztető, ${report.expired} lejárt, ${report.failures} sikertelen küldés.`
  })
}

export async function resetAllAction(): Promise<void> {
  getDevAdminAuthorization()
  await attempt(() => {
    simulationService.resetAll()
    return 'A mintaadatok, az idő és a hibaszimuláció visszaállítva.'
  })
}

export async function updateStatusAction(formData: FormData): Promise<void> {
  const auth = getDevAdminAuthorization()
  const status = String(formData.get('status'))
  await attempt(async () => {
    if (!isFulfillmentStatus(status)) return 'Hiba: ismeretlen állapot.'
    await orderService.updateFulfillmentStatus({ reference: String(formData.get('reference')), status, expectedVersion: Number(formData.get('version')) }, auth)
    return 'Állapot frissítve.'
  })
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const auth = getDevAdminAuthorization()
  await attempt(async () => {
    await orderService.cancelOrder({ reference: String(formData.get('reference')), note: String(formData.get('note') ?? ''), expectedVersion: Number(formData.get('version')) }, auth)
    return 'Rendelés törölve.'
  })
}

export async function createProposalAction(formData: FormData): Promise<void> {
  const auth = getDevAdminAuthorization()
  const lines = formData
    .getAll('lineId')
    .map(String)
    .map((lineId: string) => ({ lineId, proposedUnitPrice: Number(formData.get(`price-${lineId}`)) }))
  await attempt(async () => {
    const proposal = await priceChangeService.createProposal(
      { orderReference: String(formData.get('reference')), lines, explanation: String(formData.get('explanation') ?? ''), supersedeActive: formData.get('supersede') === 'on' },
      auth,
    )
    return proposal.proposalEmail.sentAt ? 'Ajánlat létrehozva és (szimuláltan) elküldve.' : 'Ajánlat létrehozva, de a küldés sikertelen – az ütemező újrapróbálja.'
  })
}

export async function changePriceAction(formData: FormData): Promise<void> {
  const auth = getDevAdminAuthorization()
  const [productId = '', sku = ''] = String(formData.get('target')).split('|')
  await attempt(async () => {
    await simulationService.changeCatalogPrice(productId, sku, Number(formData.get('percent')), auth)
    return `Katalógusár módosítva (${sku}).`
  })
}

export type CsvImportState = { report: ImportReport | null; error: string | null }

export async function csvImportAction(_previous: CsvImportState, formData: FormData): Promise<CsvImportState> {
  const auth = getDevAdminAuthorization()
  const file = formData.get('file')
  let csv = String(formData.get('csv') ?? '')
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return { report: null, error: 'A fájl túl nagy (legfeljebb 1 MB).' }
    csv = await file.text()
  }
  if (!csv.trim()) return { report: null, error: 'Adjon meg CSV tartalmat vagy válasszon fájlt.' }
  try {
    const report = formData.get('mode') === 'apply' ? await importService.applyImport(csv, auth) : await importService.previewImport(csv, auth)
    if (!report.dryRun) revalidatePath('/', 'layout')
    return { report, error: null }
  } catch (error: unknown) {
    if (isAppError(error)) return { report: null, error: error.message }
    throw error
  }
}
