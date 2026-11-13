'use client'

import Link from 'next/link'
import type React from 'react'
import { useState } from 'react'

import type { ImportJobView, ImportReport } from '@/types/import'

type ReportTableProps = {
  report: ImportReport
  title: string
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginTop: 16 }

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
 * Upload → server-side dry run (nothing changes) → explicit apply. Apply runs in time-boxed batches on
 * the server; this client calls it again until the job is completed. Progress is persisted, so a
 * closed tab or timeout can be resumed from the import job list.
 */
export function CsvImportClient(): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [job, setJob] = useState<ImportJobView | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const preview = async (): Promise<void> => {
    if (!file) return
    setBusy(true)
    setError(null)
    setJob(null)
    const form = new FormData()
    form.append('file', file)
    const { data, error: message } = await readJson(await fetch('/api/import-jobs/preview', { method: 'POST', body: form, credentials: 'include' }))
    setJob(data)
    setError(message)
    setBusy(false)
  }

  const apply = async (): Promise<void> => {
    if (!job) return
    if (!window.confirm('Biztosan alkalmazza az importot? A hibátlan termékcsoportok létrejönnek vagy frissülnek; hiányzó termékeket nem törlünk.')) return
    setBusy(true)
    setError(null)
    let current: ImportJobView | null = job
    // Each call processes a time-boxed batch; repeat until the server reports completion.
    for (let round = 0; round < 200 && current && current.status !== 'completed' && current.status !== 'failed'; round += 1) {
      const { data, error: message } = await readJson(await fetch(`/api/import-jobs/${job.id}/run`, { method: 'POST', credentials: 'include' }))
      if (message) {
        setError(message)
        break
      }
      current = data
      setJob(data)
    }
    setBusy(false)
  }

  const canApply = job?.status === 'previewed' && (job.previewReport?.products.created ?? 0) + (job.previewReport?.products.updated ?? 0) > 0

  return (
    <div style={{ maxWidth: 900 }}>
      <p>
        Pontosvesszővel tagolt, UTF-8 kódolású CSV.{' '}
        <a href="/minta/termekimport-minta.csv" download>
          Sablon letöltése
        </a>
        . A <code>product_id</code> stabil azonosító: azonos azonosítóval újra importálva a termék frissül (a nem kitöltött mezők megmaradnak), új azonosítóval létrejön. A fájlból hiányzó termékeket nem töröljük.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          CSV-fájl{' '}
          <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={busy} />
        </label>
        <button type="button" className="btn btn--style-secondary btn--size-medium" onClick={preview} disabled={!file || busy}>
          Ellenőrzés (próbafuttatás)
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ color: 'var(--theme-error-500)' }}>
          {error}
        </p>
      ) : null}
      {job?.previewReport ? <ReportTable report={job.previewReport} title="Előnézet – még semmi nem változott" /> : null}
      {job && job.status !== 'completed' ? (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--style-primary btn--size-medium" onClick={apply} disabled={!canApply && job.status !== 'running' ? true : busy}>
            {job.status === 'running' ? 'Folytatás' : 'Import alkalmazása'}
          </button>
          {job.status === 'running' ? (
            <span style={{ marginLeft: 12 }}>
              Folyamatban: {job.processedGroups}
              {job.totalGroups ? ` / ${job.totalGroups}` : ''} termékcsoport
            </span>
          ) : null}
        </div>
      ) : null}
      {job?.finalReport ? <ReportTable report={job.finalReport} title="Import kész" /> : null}
      {job?.error ? <p role="alert">Hiba: {job.error}</p> : null}
      <p style={{ marginTop: 24 }}>
        <Link href="/admin/collections/import-jobs">Korábbi importok</Link>
      </p>
    </div>
  )
}
