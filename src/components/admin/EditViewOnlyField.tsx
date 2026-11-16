'use client'

import { TextField, useDocumentInfo } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import type React from 'react'

/**
 * Read-only text field shown only when editing a saved document (absent from the create view). Used
 * instead of `admin.condition`, which would make the field optional in the generated types.
 */
export const EditViewOnlyField: TextFieldClientComponent = (props) => {
  const { id } = useDocumentInfo()
  if (!id) return null
  return <TextField {...props} readOnly />
}
