'use client'

import { TextField, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import type React from 'react'
import { useEffect, useRef } from 'react'

import { type SlugSyncState, syncSlug } from '@/lib/slug'

/**
 * Product slug with live generation while creating: it follows the name (same `slugify` as the server)
 * until the admin edits it by hand; the virtual `slugAuto` flag tells the server, which may then add a
 * suffix on collision instead of reporting a duplicate. Existing products never change their slug when
 * the name changes. Validation messages come from the native text field.
 */
export const ProductSlugField: TextFieldClientComponent = (props) => {
  const path = props.path ?? props.field.name
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<string | null>({ path })
  const { value: autoValue, setValue: setAuto } = useField<boolean | null>({ path: 'slugAuto' })
  const name = useFormFields(([fields]) => fields.name?.value)
  const following = !id && autoValue === true
  const sync = useRef<SlugSyncState>({ lastGenerated: null, previousValue: value ?? '' })

  useEffect(() => {
    const result = syncSlug(sync.current, value ?? '', typeof name === 'string' ? name : '', following)
    sync.current = result.state
    if (result.stopFollowing) setAuto(false)
    else if (result.setValue !== null) setValue(result.setValue)
  }, [following, name, value, setAuto, setValue])

  return <TextField {...props} />
}
