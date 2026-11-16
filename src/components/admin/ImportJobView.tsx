import { Gutter } from '@payloadcms/ui'
import type { DocumentViewServerProps } from 'payload'
import type React from 'react'

import { isAdminRequest } from '@/collections/utils/access'
import { ImportJobClient } from '@/components/admin/ImportJobClient'
import { importService } from '@/services/importService'

/**
 * "Termékimportok" create and detail view (the collection's `views.edit.root`): CSV upload with dry run
 * on create; status, reports and the explicit apply/resume/retry on an existing record. There is no
 * editable form, so saving can never start an import.
 */
export async function ImportJobView(props: DocumentViewServerProps): Promise<React.JSX.Element> {
  const req = props.initPageResult.req
  const user = req.user
  const id = typeof props.doc?.id === 'number' ? props.doc.id : null
  if (!isAdminRequest(req) || !user) {
    return (
      <Gutter>
        <p>Ehhez az oldalhoz adminisztrátori bejelentkezés szükséges.</p>
      </Gutter>
    )
  }
  const auth = { kind: 'admin' as const, adminId: String(user.id), label: 'email' in user && typeof user.email === 'string' ? user.email : 'admin' }
  const job = id === null ? null : await importService.getJob(id, auth)
  return (
    <Gutter>
      <h1>{job ? `Termékimport: ${job.fileName}` : 'Új termékimport (CSV)'}</h1>
      <ImportJobClient initialJob={job} />
    </Gutter>
  )
}
