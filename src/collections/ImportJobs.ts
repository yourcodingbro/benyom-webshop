import type { CollectionConfig } from 'payload'

import { adminOnly, serverOnly } from '@/collections/access'
import { importJobEndpoints } from '@/collections/endpoints'

export const IMPORT_JOB_STATUS_LABELS: Record<string, string> = {
  previewed: 'Előnézet kész',
  running: 'Folyamatban',
  completed: 'Befejezve',
  failed: 'Sikertelen',
}

/**
 * Persisted CSV import jobs. Preview (dry run) and apply are separate steps. Apply processes
 * product groups in short batches and records each finished group in `results`, so an interrupted
 * run (timeout, deploy) resumes without redoing or losing work. Nothing is ever deleted.
 */
export const ImportJobs: CollectionConfig = {
  slug: 'import-jobs',
  labels: { singular: 'Importfeladat', plural: 'Termékimportok' },
  admin: {
    useAsTitle: 'fileName',
    group: 'Katalógus',
    defaultColumns: ['createdAt', 'fileName', 'status', 'createdByLabel', 'finishedAt'],
    description: 'Új import a „Termékimport (CSV)” oldalon indítható.',
  },
  access: { read: adminOnly, create: serverOnly, update: serverOnly, delete: serverOnly },
  defaultSort: '-createdAt',
  endpoints: importJobEndpoints,
  fields: [
    { name: 'fileName', label: 'Fájl', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'status', label: 'Állapot', type: 'select', required: true, index: true, options: Object.entries(IMPORT_JOB_STATUS_LABELS).map(([value, label]) => ({ value, label })), admin: { readOnly: true } },
    { name: 'createdBy', label: 'Indította', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'createdByLabel', label: 'Indította (e-mail)', type: 'text', admin: { readOnly: true } },
    { name: 'startedAt', label: 'Alkalmazás kezdete', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'heartbeatAt', label: 'Utolsó előrehaladás', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'finishedAt', label: 'Befejezve', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'error', label: 'Hiba', type: 'textarea', admin: { readOnly: true } },
    { name: 'previewReport', label: 'Előnézet (próbafuttatás) eredménye', type: 'json', admin: { readOnly: true } },
    { name: 'results', label: 'Feldolgozott termékcsoportok', type: 'json', admin: { readOnly: true } },
    { name: 'finalReport', label: 'Végeredmény', type: 'json', admin: { readOnly: true } },
    { name: 'csv', label: 'CSV tartalom', type: 'textarea', required: true, admin: { readOnly: true, hidden: true } },
  ],
}
