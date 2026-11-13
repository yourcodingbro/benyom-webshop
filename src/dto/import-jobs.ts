import 'server-only'

import type { PayloadRequest } from 'payload'

import { lockRow } from '@/collections/hooks/db'
import { payloadClient, withTransaction } from '@/dto/payload'
import { assertAdminOrSystem } from '@/lib/authorization'
import { AppError } from '@/lib/errors'
import type { ImportJob as ImportJobDoc } from '@/payload-types'
import type { AuthorizationContext } from '@/types/auth'
import type { IsoDateTime } from '@/types/common'
import type { ImportGroupResult, ImportJob, ImportJobStatus, ImportReport } from '@/types/import'

function toJob(doc: ImportJobDoc): ImportJob {
  return {
    id: doc.id,
    fileName: doc.fileName,
    status: doc.status as ImportJobStatus,
    csv: doc.csv,
    previewReport: (doc.previewReport as ImportReport | null) ?? null,
    results: (doc.results as Record<string, ImportGroupResult> | null) ?? {},
    finalReport: (doc.finalReport as ImportReport | null) ?? null,
    error: doc.error ?? null,
    startedAt: doc.startedAt ?? null,
    heartbeatAt: doc.heartbeatAt ?? null,
    finishedAt: doc.finishedAt ?? null,
    createdAt: doc.createdAt,
  }
}

export async function createImportJob(input: { fileName: string; csv: string; previewReport: ImportReport }, auth: AuthorizationContext): Promise<ImportJob> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const userId = auth.kind === 'admin' ? Number(auth.adminId) : NaN
  const doc = await payload.create({
    collection: 'import-jobs',
    data: {
      fileName: input.fileName.slice(0, 200) || 'import.csv',
      csv: input.csv,
      status: 'previewed',
      previewReport: input.previewReport,
      results: {},
      createdBy: Number.isSafeInteger(userId) ? userId : null,
      createdByLabel: auth.kind === 'admin' ? (auth.label ?? auth.adminId) : auth.kind,
    },
    overrideAccess: true,
  })
  return toJob(doc)
}

export async function getImportJob(id: number, auth: AuthorizationContext): Promise<ImportJob | null> {
  assertAdminOrSystem(auth)
  const payload = await payloadClient()
  const result = await payload.find({ collection: 'import-jobs', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
  const doc = result.docs[0]
  return doc ? toJob(doc) : null
}

/**
 * Claims a job for one processing batch. A job that is already running is only taken over when its
 * heartbeat is stale (an interrupted run), so two batches never process the same job at once.
 */
export async function claimImportJob(id: number, now: IsoDateTime, staleBefore: IsoDateTime, auth: AuthorizationContext): Promise<ImportJob | null> {
  assertAdminOrSystem(auth)
  return withTransaction(async (req: PayloadRequest): Promise<ImportJob | null> => {
    if (!(await lockRow(req, 'import-jobs', id))) throw new AppError('NOT_FOUND', 'Az importfeladat nem található.')
    const result = await req.payload.find({ collection: 'import-jobs', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
    const doc = result.docs[0]
    if (!doc) throw new AppError('NOT_FOUND', 'Az importfeladat nem található.')
    if (doc.status === 'completed' || doc.status === 'failed') return toJob(doc)
    if (doc.status === 'running' && doc.heartbeatAt && doc.heartbeatAt > staleBefore) return null
    const updated = await req.payload.update({
      collection: 'import-jobs',
      id,
      data: { status: 'running', startedAt: doc.startedAt ?? now, heartbeatAt: now },
      req,
      overrideAccess: true,
    })
    return toJob(updated)
  })
}

/** Records one finished product group immediately, so progress survives an interruption. */
export async function recordImportGroup(id: number, productId: string, result: ImportGroupResult, now: IsoDateTime): Promise<void> {
  await withTransaction(async (req: PayloadRequest): Promise<void> => {
    await lockRow(req, 'import-jobs', id)
    const found = await req.payload.find({ collection: 'import-jobs', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
    const doc = found.docs[0]
    if (!doc) return
    const results = { ...((doc.results as Record<string, ImportGroupResult> | null) ?? {}), [productId]: result }
    await req.payload.update({ collection: 'import-jobs', id, data: { results, heartbeatAt: now }, req, overrideAccess: true })
  })
}

export async function finishImportJob(id: number, outcome: { status: 'completed' | 'failed' | 'running'; finalReport: ImportReport | null; error: string | null }, now: IsoDateTime): Promise<ImportJob> {
  const payload = await payloadClient()
  const doc = await payload.update({
    collection: 'import-jobs',
    id,
    data: { status: outcome.status, finalReport: outcome.finalReport, error: outcome.error, heartbeatAt: now, finishedAt: outcome.status === 'running' ? null : now },
    overrideAccess: true,
  })
  return toJob(doc)
}
