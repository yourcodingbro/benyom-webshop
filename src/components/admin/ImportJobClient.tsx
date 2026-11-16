'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useState } from 'react'

import type { ImportJobView, ImportReport } from '@/types/import'

type ReportTableProps = {
  report: ImportReport
  title: string
}

type ImportJobClientProps = {
  /** null on the create view; the persisted job on the detail view. */
  initialJob: ImportJobView | null
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginTop: 16 }

const STATUS_TEXT: Record<ImportJobView['status'], string> = {
  previewed: 'Előnézet kész – még semmi nem változott. Az import csak a megerősítés után indul.',
  running: 'Folyamatban (vagy megszakadt). A folytatás a már feldolgozott termékcsoportokat kihagyja.',
  completed: 'Befejezve.',
  failed: 'Megszakadt hibával. Az újrapróbálás a már feldolgozott termékcsoportokat kihagyja.',
}

function ReportTable(props: ReportTableProps): React.JSX.Element {
  const { report } = props
  const row = (label: string, counts: ImportReport['products']): React.JSX.Element => (
    <tr>
      <th style={{ textAlign: 'left', paddingRight: 16 }}>{label}</th>
      <td>{counts.created} új</td>
      <td>{counts.updated} frissített</td>
      <td>{counts.skipped} változatlan</td>
      <td>{counts.failed} hibás</td>
    </tr>
  )
  return (
    <div style={box}>
      <h3>{props.title}</h3>
      <p>{report.rowCount} sor feldolgozva.</p>
      <table>
        <tbody>
          {row('Termékek', report.products)}
          {row('Változatok', report.variants)}
        </tbody>
      </table>
      {report.brandsCreated.length > 0 ? <p>Új márkák: {report.brandsCreated.join(', ')}</p> : null}
      {report.categoriesCreated.length > 0 ? <p>Új kategóriák: {report.categoriesCreated.join(', ')}</p> : null}
      {report.errors.length > 0 ? (
        <>
          <h4>Hibák (a hibás termékcsoport egésze kimarad)</h4>
          <ul>
            {report.errors.map((error) => (
              <li key={`${error.row}-${error.column}-${error.message}`}>
                {error.row > 0 ? `${error.row}. sor` : 'Fájl'}
                {error.column ? ` – ${error.column}` : ''}: {error.message}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

async function readJson(response: Response): Promise<{ data: ImportJobView | null; error: string | null }> {
  const body = (await response.json().catch(() => null)) as (ImportJobView & { error?: string }) | null
  if (!response.ok || !body) return { data: null, error: body?.error ?? 'A kérés sikertelen.' }
  return { data: body, error: null }
}

/**
 * The "Termékimportok" create and detail views. Create: upload → server-side dry run (persisted as a
 * job, nothing else changes) → the detail view. Detail: progress, reports and the explicit apply /
 * resume / retry action. Apply runs in time-boxed batches; this client calls it again until the job
 * finishes. Progress is persisted, so a closed tab or timeout is resumed from the same record.
 */
export function ImportJobClient(props: ImportJobClientProps): React.JSX.Element {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [job, setJob] = useState<ImportJobView | null>(props.initialJob)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const preview = async (): Promise<void> => {
    if (!file) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    const { data, error: message } = await readJson(await fetch('/api/import-jobs/preview', { method: 'POST', body: form, credentials: 'include' }))
    setBusy(false)
    if (!data) {
      setError(message)
      return
    }
    // The preview is its own record: continue on its detail view (refresh-safe, appears in the history).
    router.replace(`/admin/collections/import-jobs/${data.id}`)
  }

  const run = async (): Promise<void> => {
    if (!job) return
    const question =
      job.status === 'previewed'
        ? 'Biztosan alkalmazza az importot? A hibátlan termékcsoportok létrejönnek vagy frissülnek; hiányzó termékeket nem törlünk.'
        : 'Folytatja az importot? A már feldolgozott termékcsoportok kimaradnak.'
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    let current: ImportJobView | null = job
    // Each call processes a time-boxed batch; repeat until the server reports completion.
    for (let round = 0; round < 200 && current && current.status !== 'completed'; round += 1) {
      const { data, error: message } = await readJson(await fetch(`/api/import-jobs/${job.id}/run`, { method: 'POST', credentials: 'include' }))
      if (message) {
        setError(message)
        break
      }
      current = data
      setJob(data)
      if (data?.status === 'failed') break
    }
    setBusy(false)
    router.refresh()
  }

  if (!job) {
    return (
      <div style={{ maxWidth: 900 }}>
        <p>
          Pontosvesszővel tagolt, UTF-8 kódolású CSV.{' '}
          <a href="/minta/termekimport-minta.csv" download>
            Sablon letöltése
          </a>
          . A <code>product_id</code> stabil azonosító: azonos azonosítóval újra importálva a termék frissül (a nem kitöltött mezők megmaradnak), új azonosítóval létrejön. Üresen hagyva új termék esetén automatikus UUID-t kap; meglévő termék ilyenkor a slug alapján frissül. A fájlból hiányzó termékeket nem töröljük.
        </p>
        <p>Az ellenőrzés csak próbafuttatás: semmi nem változik, amíg az előnézet után kifejezetten meg nem erősíti az importot.</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            CSV-fájl <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={busy} />
          </label>
          <button type="button" className="btn btn--style-primary btn--size-medium" onClick={preview} disabled={!file || busy}>
            {busy ? 'Ellenőrzés…' : 'Ellenőrzés (próbafuttatás)'}
          </button>
        </div>
        {error ? (
          <p role="alert" style={{ color: 'var(--theme-error-500)' }}>
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  const hasChanges = (job.previewReport?.products.created ?? 0) + (job.previewReport?.products.updated ?? 0) > 0
  const action = job.status === 'previewed' ? (hasChanges ? 'Import megerősítése és alkalmazása' : null) : job.status === 'running' ? 'Folytatás' : job.status === 'failed' ? 'Újrapróbálás' : null

  return (
    <div style={{ maxWidth: 900 }}>
      <p role="status">
        <strong>Állapot:</strong> {STATUS_TEXT[job.status]}
        {job.status === 'running' || job.status === 'failed' ? ` (${job.processedGroups}${job.totalGroups ? ` / ${job.totalGroups}` : ''} termékcsoport kész)` : ''}
      </p>
      {job.status === 'previewed' && !hasChanges ? <p>Az előnézet szerint nincs alkalmazható változás.</p> : null}
      {action ? (
        <button type="button" className="btn btn--style-primary btn--size-medium" onClick={run} disabled={busy}>
          {busy ? 'Feldolgozás…' : action}
        </button>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: 'var(--theme-error-500)' }}>
          {error}
        </p>
      ) : null}
      {job.error ? <p role="alert">Hiba: {job.error}</p> : null}
      {job.finalReport ? <ReportTable report={job.finalReport} title="Import eredménye" /> : null}
      {job.previewReport ? <ReportTable report={job.previewReport} title="Előnézet (próbafuttatás)" /> : null}
      <p style={{ marginTop: 24 }}>
        <Link href="/admin/collections/import-jobs/create">Új import</Link> · <Link href="/admin/collections/import-jobs">Összes import</Link>
      </p>
    </div>
  )
}
