'use client'

import { UploadField, useDocumentInfo, useField, useForm, useFormFields } from '@payloadcms/ui'
import type { UploadFieldClientComponent } from 'payload'
import type React from 'react'
import { useEffect, useId, useRef, useState } from 'react'

import { hexToPathSegment, normalizeHexColor } from '@/lib/hex'
import { slugify } from '@/lib/slug'

type UploadResponse = { id?: number; productSlug?: string; objectKey?: string | null; error?: string }

const ACCEPT = 'image/webp,image/jpeg,image/png,image/avif'

function idOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return ''
}

/** Reads one slug for the path preview; failures only hide the preview. */
function useSlugOf(collection: 'brands' | 'categories', id: string): string | null {
  const [slug, setSlug] = useState<{ id: string; slug: string } | null>(null)
  useEffect(() => {
    if (!id) return
    let active = true
    void fetch(`/api/${collection}/${encodeURIComponent(id)}?depth=0`, { credentials: 'include' })
      .then((response: Response) => (response.ok ? (response.json() as Promise<{ slug?: string }>) : null))
      .then((doc: { slug?: string } | null) => {
        if (active && doc?.slug) setSlug({ id, slug: doc.slug })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [collection, id])
  return slug && slug.id === id ? slug.slug : null
}

/**
 * Product gallery / variant images: Payload's native field for choosing existing media, plus a direct
 * upload whose storage path the server derives from this form (brand, primary category, product slug,
 * and the variant's color). Uploading is disabled, with the reason shown, until those values exist; the
 * server checks the same rules. New media is selected automatically and unsaved form values are kept.
 */
export const ProductImagesField: UploadFieldClientComponent = (props) => {
  const path = props.path ?? props.field.name
  const variantRow = /^(variants\.\d+)\.images$/.exec(path)?.[1] ?? null
  const isVariantImage = variantRow !== null
  const inputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const { id: productId } = useDocumentInfo()
  const { dispatchFields, setModified } = useForm()
  const { value, setValue } = useField<unknown[] | null>({ path })

  const name = useFormFields(([fields]) => fields.name?.value)
  const brand = useFormFields(([fields]) => fields.brand?.value)
  const categories = useFormFields(([fields]) => fields.categories?.value)
  const primaryCategory = useFormFields(([fields]) => fields.primaryCategory?.value)
  const slug = useFormFields(([fields]) => fields.slug?.value)
  const slugAuto = useFormFields(([fields]) => fields.slugAuto?.value)
  const colorHex = useFormFields(([fields]) => (variantRow ? fields[`${variantRow}.colorHex`]?.value : undefined))
  const colorLabel = useFormFields(([fields]) => (variantRow ? fields[`${variantRow}.colorLabel`]?.value : undefined))

  const [busy, setBusy] = useState<boolean>(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const productName = typeof name === 'string' ? name.trim() : ''
  const brandId = idOf(brand)
  const categoryIds = Array.isArray(categories) ? categories.map(idOf).filter(Boolean) : []
  const primaryId = idOf(primaryCategory)
  const categoryId = primaryId && categoryIds.includes(primaryId) ? primaryId : (categoryIds[0] ?? '')
  const hex = normalizeHexColor(colorHex)
  const currentSlug = typeof slug === 'string' && slug ? slug : null
  const brandSlug = useSlugOf('brands', brandId)
  const categorySlug = useSlugOf('categories', categoryId)

  const missing: string[] = []
  if (!brandId) missing.push('a márkát')
  if (!categoryId) missing.push('legalább egy kategóriát')
  if (!productName) missing.push('a termék nevét')
  if (isVariantImage && !hex) missing.push('a változat érvényes HEX színét (pl. #1F1F1F)')
  const disabled = missing.length > 0 || busy || props.readOnly === true

  const productSegment = currentSlug ?? (productName ? `${slugify(productName) || 'termek'} (mentéskor véglegesítve)` : '…')
  const pathPreview = [brandSlug ?? '…', categorySlug ?? '…', productSegment, ...(isVariantImage && hex ? [hexToPathSegment(hex)] : []), 'fajlnev-<egyedi>.webp'].join('/')

  const upload = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0 || disabled) return
    setBusy(true)
    setMessage(null)
    // A slug still following the name is not reserved yet: the server reserves one from the name (suffix if taken).
    let reservedSlug = slugAuto === true && !productId ? null : currentSlug
    const added: number[] = []
    let failure: string | null = null
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append(
        '_payload',
        JSON.stringify({
          productId: productId ? String(productId) : null,
          name: productName,
          slug: reservedSlug,
          brandId,
          categoryId,
          isVariantImage,
          variantColorHex: hex,
          colorLabel: typeof colorLabel === 'string' ? colorLabel : null,
        }),
      )
      const response = await fetch('/api/media/product-upload', { method: 'POST', credentials: 'include', body: form }).catch(() => null)
      const body = ((await response?.json().catch(() => ({}))) ?? {}) as UploadResponse
      if (!response?.ok || typeof body.id !== 'number') {
        failure = body.error ?? 'A feltöltés nem sikerült. Ellenőrizze a kapcsolatot, majd próbálja újra.'
        break
      }
      added.push(body.id)
      // An unsaved product keeps the slug reserved by its first upload, so every path and the saved product match.
      if (!productId && body.productSlug) {
        if (body.productSlug !== reservedSlug || slug !== body.productSlug) dispatchFields({ type: 'UPDATE', path: 'slug', value: body.productSlug })
        reservedSlug = body.productSlug
        // Media paths now use this slug: it must no longer follow the name.
        dispatchFields({ type: 'UPDATE', path: 'slugAuto', value: false })
      }
    }
    if (added.length > 0) {
      const existing = Array.isArray(value) ? value.map(idOf).filter(Boolean).map(Number) : []
      setValue([...existing, ...added])
      setModified(true)
    }
    if (fileInput.current) fileInput.current.value = ''
    setBusy(false)
    setMessage(failure ? { ok: false, text: added.length > 0 ? `${added.length} kép feltöltve és kiválasztva; a további feltöltés megszakadt: ${failure}` : failure } : { ok: true, text: `${added.length} kép feltöltve és kiválasztva. Mentse a terméket a módosítás véglegesítéséhez.` })
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <UploadField {...props} />
      <div style={{ marginTop: 8 }}>
        <input ref={fileInput} id={inputId} type="file" accept={ACCEPT} multiple hidden disabled={disabled} onChange={(event) => void upload(event.target.files)} />
        <button
          type="button"
          className="btn btn--style-secondary btn--size-small"
          disabled={disabled}
          aria-describedby={`${inputId}-help`}
          onClick={() => fileInput.current?.click()}
          style={{ margin: 0 }}
        >
          {busy ? 'Feltöltés…' : isVariantImage ? 'Új kép feltöltése ehhez a színhez' : 'Új kép feltöltése'}
        </button>
        <p id={`${inputId}-help`} style={{ margin: '6px 0 0', color: 'var(--theme-elevation-600)', fontSize: 13 }}>
          {missing.length > 0
            ? `Új kép feltöltéséhez előbb adja meg ${missing.join(', ')}. Meglévő kép kiválasztása most is lehetséges.`
            : `Tárolási útvonal (automatikus): ${pathPreview}`}
        </p>
        {missing.length === 0 && categoryIds.length > 1 ? (
          <p style={{ margin: '2px 0 0', color: 'var(--theme-elevation-600)', fontSize: 13 }}>Több kategória esetén az elsődleges kategória határozza meg az útvonalat.</p>
        ) : null}
        {message ? (
          <p role={message.ok ? 'status' : 'alert'} style={{ margin: '6px 0 0', color: message.ok ? 'var(--theme-success-500)' : 'var(--theme-error-500)' }}>
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  )
}
