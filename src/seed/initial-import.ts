/**
 * Initial data import (shared by `npm run import:initial` and the integration tests). Moves the original
 * sample dataset into the database through Payload's Local API. Idempotent: stable ids, slugs, SKUs,
 * media object keys and order idempotency keys; existing records are never overwritten or deleted.
 * Demo orders are historical (isDemo): no emails, jobs or scheduling.
 */
import type { Payload } from 'payload'
import sharp from 'sharp'

import { type SeedOrder, sampleData } from '@/seed/initial-data'
import { placeholderSvg } from '@/seed/placeholder-image'
import type { Brand, Category, Product, ProductImage } from '@/types/catalog'
import type { AuditEventInput, OrderWriteContext } from '@/types/workflow'

export type Outcome = 'created' | 'repaired' | 'skipped' | 'mapped' | 'conflict' | 'failed' | 'unavailable'
export type Entity = 'settings' | 'brands' | 'categories' | 'media' | 'products' | 'demoOrders'

export type InitialImportReport = {
  counts: Record<Entity, Record<Outcome, number>>
  details: string[]
  /** Set when a shared infrastructure or schema error stopped the import (the remaining work was not attempted). */
  aborted: string | null
}

const zero = (): Record<Outcome, number> => ({ created: 0, repaired: 0, skipped: 0, mapped: 0, conflict: 0, failed: 0, unavailable: 0 })
let report: InitialImportReport['counts'] = { settings: zero(), brands: zero(), categories: zero(), media: zero(), products: zero(), demoOrders: zero() }
let details: string[] = []

function note(entity: Entity, outcome: Outcome, message: string | null = null): void {
  report[entity][outcome] += 1
  if (message) details.push(`[${entity}] ${outcome}: ${message}`)
}

/** A failure that every remaining record would hit too (schema, connection, storage credentials/bucket). */
export class ImportAbortError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportAbortError'
  }
}

type ErrorLike = { name?: unknown; message?: unknown; code?: unknown; detail?: unknown; table?: unknown; column?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown }; cause?: unknown }

/**
 * The whole cause chain in one line: PostgreSQL code/message/detail/table/column, S3 error codes.
 * The SQL text and its parameters (drizzle "Failed query … params:") and any connection URL are omitted.
 */
export function describeError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current && typeof current === 'object' && depth < 6; depth += 1) {
    const e = current as ErrorLike
    const message = typeof e.message === 'string' ? e.message.split('\n')[0] ?? '' : ''
    const text = (message.startsWith('Failed query:') ? 'Failed query (SQL omitted)' : message).replace(/postgres(ql)?:\/\/\S+/g, '[connection]')
    const facts = [
      typeof e.code === 'string' ? `code=${e.code}` : null,
      typeof e.Code === 'string' ? `s3=${e.Code}` : null,
      typeof e.$metadata?.httpStatusCode === 'number' ? `http=${e.$metadata.httpStatusCode}` : null,
      typeof e.detail === 'string' ? `detail=${e.detail}` : null,
      typeof e.table === 'string' ? `table=${e.table}` : null,
      typeof e.column === 'string' ? `column=${e.column}` : null,
    ].filter(Boolean)
    parts.push([text || String(e.name ?? 'Error'), ...facts].join(' '))
    current = e.cause
  }
  return parts.join(' ← ')
}

const INFRASTRUCTURE_S3: ReadonlySet<string> = new Set(['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'NoSuchBucket', 'AccessDenied', 'CredentialsProviderError', 'InvalidBucketName'])

/** PostgreSQL schema/connection/auth classes (42, 08, 28, 3D, 3F), network failures and S3 credential/bucket errors. */
function isInfrastructureError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && typeof current === 'object' && depth < 6; depth += 1) {
    const e = current as ErrorLike & { syscall?: unknown }
    if (typeof e.code === 'string' && /^(42|08|28|3D|3F)/.test(e.code)) return true
    if (typeof e.code === 'string' && /^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET)$/.test(e.code)) return true
    const name = typeof e.Code === 'string' ? e.Code : typeof e.name === 'string' ? e.name : ''
    if (INFRASTRUCTURE_S3.has(name)) return true
    if (e.$metadata?.httpStatusCode === 401 || e.$metadata?.httpStatusCode === 403) return true
    current = e.cause
  }
  return false
}

function errorText(error: unknown): string {
  return describeError(error)
}

/** Fails fast if the media table does not match the configured schema (e.g. an unapplied migration). */
async function checkMediaReadiness(payload: Payload): Promise<void> {
  try {
    await payload.find({ collection: 'media', limit: 1, depth: 0, overrideAccess: true })
  } catch (error: unknown) {
    throw new ImportAbortError(`A médiatábla nem használható (${describeError(error)}). Futtassa: npm run migrate:status, majd npm run migrate.`)
  }
}

async function importSettings(payload: Payload): Promise<void> {
  const current = await payload.findGlobal({ slug: 'store-settings', overrideAccess: true, depth: 0 })
  if (current.storeName) {
    note('settings', 'skipped', 'Az áruház beállításai már léteznek; nem írjuk felül.')
    return
  }
  const settings = sampleData.settings
  await payload.updateGlobal({
    slug: 'store-settings',
    overrideAccess: true,
    data: {
      storeName: settings.storeName,
      storeNotificationEmail: settings.storeNotificationEmail,
      contactRecipientEmail: settings.contactRecipientEmail,
      contact: settings.contact,
      collection: { address: settings.collection.address, openingHours: settings.collection.openingHours.map((line: string) => ({ line })), note: settings.collection.note },
      deliveryMethods: settings.deliveryMethods.map((method) => ({
        methodId: method.id,
        kind: method.kind,
        name: method.name,
        description: method.description,
        enabled: method.enabled,
        feeKind: method.fee.kind,
        feeAmount: method.fee.kind === 'fixed' ? method.fee.amount : null,
      })),
      legal: settings.legal,
      seo: settings.seo,
      homepage: settings.homepage,
      pages: settings.pages.map((page) => ({ slug: page.slug, title: page.title, body: page.paragraphs.join('\n\n') })),
    },
  })
  note('settings', 'created')
}

/** Brands/categories: same id → skip (or conflict if different); same slug under another id → mapped. */
async function importTaxonomy(payload: Payload, collection: 'brands' | 'categories', items: (Brand | Category)[], idMap: Map<string, string>): Promise<void> {
  for (const item of items) {
    try {
      const byId = await payload.find({ collection, where: { id: { equals: item.id } }, limit: 1, depth: 0, overrideAccess: true })
      const existing = byId.docs[0]
      if (existing) {
        idMap.set(item.id, existing.id)
        const differs = existing.slug !== item.slug || existing.name !== item.name
        note(collection, differs ? 'conflict' : 'skipped', differs ? `${item.id}: eltérő meglévő rekord, nem írjuk felül.` : null)
        continue
      }
      const bySlug = await payload.find({ collection, where: { slug: { equals: item.slug } }, limit: 1, depth: 0, overrideAccess: true })
      const sameSlug = bySlug.docs[0]
      if (sameSlug) {
        idMap.set(item.id, sameSlug.id)
        note(collection, 'mapped', `${item.id} → ${sameSlug.id} (azonos slug)`)
        continue
      }
      await payload.create({ collection, data: { id: item.id, slug: item.slug, name: item.name, description: item.description, sortOrder: item.sortOrder, popularityRank: item.popularityRank }, overrideAccess: true })
      idMap.set(item.id, item.id)
      note(collection, 'created')
    } catch (error: unknown) {
      note(collection, 'failed', `${item.id}: ${errorText(error)}`)
    }
  }
}

/** Rasterizes and uploads each placeholder once (object key is the idempotency key). */
async function importMedia(payload: Payload, product: Product, brandSlug: string, categorySlug: string, mediaMap: Map<string, number>, storageReady: boolean): Promise<void> {
  for (const image of product.images) {
    const objectKey = image.objectKey.replace(/\.svg$/, '.webp')
    if (!storageReady) {
      note('media', 'unavailable', `${objectKey}: a Supabase Storage nincs beállítva (vagy skip-media); a kép nem lett feltöltve.`)
      continue
    }
    try {
      const existing = await payload.find({ collection: 'media', where: { objectKey: { equals: objectKey } }, limit: 1, depth: 0, overrideAccess: true })
      const found = existing.docs[0]
      if (found) {
        mediaMap.set(image.id, found.id)
        note('media', 'skipped')
        continue
      }
      const data = await sharp(Buffer.from(placeholderSvg(categorySlug, image.colorHex))).webp({ quality: 82 }).toBuffer()
      const filename = objectKey.split('/').pop() ?? 'elolnezet.webp'
      // Payload makes filenames unique per prefix before hooks run, so the prefix is passed explicitly:
      // otherwise every product's "elolnezet.webp" would be renamed and the agreed object key lost.
      const prefix = objectKey.slice(0, objectKey.lastIndexOf('/'))
      const created = await payload.create({
        collection: 'media',
        data: { alt: image.alt, brandSlug, categorySlug, productSlug: product.slug, colorHex: image.colorHex, prefix },
        file: { data, mimetype: 'image/webp', name: filename, size: data.length },
        overrideAccess: true,
      })
      mediaMap.set(image.id, created.id)
      note('media', 'created')
    } catch (error: unknown) {
      if (isInfrastructureError(error)) throw new ImportAbortError(`Média (${objectKey}): ${describeError(error)}`)
      note('media', 'failed', `${objectKey}: ${errorText(error)}`)
    }
  }
}

async function importProducts(payload: Payload, brandMap: Map<string, string>, categoryMap: Map<string, string>, storageReady: boolean): Promise<void> {
  const brands = new Map(sampleData.brands.map((brand: Brand) => [brand.id, brand.slug]))
  const categories = new Map(sampleData.categories.map((category: Category) => [category.id, category.slug]))
  for (const product of sampleData.products) {
    try {
      const existing = await payload.find({ collection: 'products', where: { id: { equals: product.id } }, limit: 1, depth: 0, draft: true, overrideAccess: true })
      const current = existing.docs[0]
      if (current) {
        // Repairs image relations from an earlier partial run: adds the product's seed images that are not
        // linked yet and fills variants without images. Never removes or replaces an existing relation.
        if (storageReady && product.images.length > 0) {
          const mediaMap = new Map<string, number>()
          await importMedia(payload, product, brands.get(product.brandId) ?? 'ismeretlen', categories.get(product.categoryIds[0] ?? '') ?? 'egyeb', mediaMap, storageReady)
          const mapped = (ids: string[]): number[] => ids.map((id: string) => mediaMap.get(id)).filter((id): id is number => id !== undefined)
          const linked = (current.images ?? []).map((image) => (typeof image === 'number' ? image : image.id))
          const addedToProduct = mapped(product.images.map((image: ProductImage) => image.id)).filter((id: number) => !linked.includes(id))
          let variantsFilled = 0
          const variants = current.variants.map((variant) => {
            const seedVariant = product.variants.find((item) => item.sku === variant.sku)
            if ((variant.images ?? []).length > 0 || !seedVariant) return variant
            const images = mapped(seedVariant.imageIds)
            if (images.length > 0) variantsFilled += 1
            return { ...variant, images }
          })
          if (addedToProduct.length > 0 || variantsFilled > 0) {
            await payload.update({ collection: 'products', id: current.id, draft: current._status !== 'published', overrideAccess: true, data: { images: [...linked, ...addedToProduct], variants } })
            note('products', 'repaired', `${product.id}: ${addedToProduct.length} termékkép és ${variantsFilled} változat kép-kapcsolata helyreállítva.`)
            continue
          }
          const stillMissing = (current.images ?? []).length < product.images.length || current.variants.some((variant) => (variant.images ?? []).length === 0)
          note('products', 'skipped', stillMissing ? `${product.id}: kép-kapcsolat még hiányzik (lásd a média hibákat).` : null)
          continue
        }
        note('products', 'skipped')
        continue
      }
      const brandId = brandMap.get(product.brandId)
      const categoryIds = product.categoryIds.map((id: string) => categoryMap.get(id)).filter((id): id is string => Boolean(id))
      if (!brandId || categoryIds.length === 0) {
        note('products', 'failed', `${product.id}: hiányzó márka vagy kategória.`)
        continue
      }
      const mediaMap = new Map<string, number>()
      await importMedia(payload, product, brands.get(product.brandId) ?? 'ismeretlen', categories.get(product.categoryIds[0] ?? '') ?? 'egyeb', mediaMap, storageReady)
      const mapImages = (ids: string[]): number[] => ids.map((id: string) => mediaMap.get(id)).filter((id): id is number => id !== undefined)
      await payload.create({
        collection: 'products',
        draft: product.status === 'draft',
        overrideAccess: true,
        data: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          model: product.model,
          brand: brandId,
          categories: categoryIds,
          description: product.description,
          featured: product.featured,
          orderability: product.orderability,
          procurementEstimate: { minDays: product.procurementEstimate?.minDays ?? null, maxDays: product.procurementEstimate?.maxDays ?? null },
          images: mapImages(product.images.map((image: ProductImage) => image.id)),
          specifications: product.specifications,
          seo: product.seo,
          _status: product.status,
          variants: product.variants.map((variant) => ({
            sku: variant.sku,
            colorHex: variant.attributes.colorHex,
            colorLabel: variant.attributes.colorLabel,
            storageGb: variant.attributes.storageGb,
            ramGb: variant.attributes.ramGb,
            caseSizeMm: variant.attributes.caseSizeMm,
            price: variant.price,
            orderability: variant.orderability,
            procurementEstimate: { minDays: variant.procurementEstimate?.minDays ?? null, maxDays: variant.procurementEstimate?.maxDays ?? null },
            images: mapImages(variant.imageIds),
          })),
        },
      })
      note('products', 'created')
    } catch (error: unknown) {
      if (error instanceof ImportAbortError) throw error
      if (isInfrastructureError(error)) throw new ImportAbortError(`Termék (${product.id}): ${describeError(error)}`)
      note('products', 'failed', `${product.id}: ${errorText(error)}`)
    }
  }
}

/** Historical demo orders: `isDemo`, original audit history, no emails/jobs/scheduling (side effects suppressed). */
async function importDemoOrders(payload: Payload): Promise<void> {
  for (const order of sampleData.orders) {
    try {
      const existing = await payload.find({ collection: 'orders', where: { or: [{ idempotencyKey: { equals: order.idempotencyKey } }, { reference: { equals: order.reference } }] }, limit: 1, depth: 0, overrideAccess: true })
      if (existing.docs[0]) {
        note('demoOrders', 'skipped')
        continue
      }
      const events: AuditEventInput[] = [
        ...order.events.map((event: SeedOrder['events'][number]): AuditEventInput => ({
          type: event.type,
          actor: event.actor === 'admin' ? { type: 'admin', userId: null, label: 'demó admin' } : event.actor === 'customer' ? { type: 'customer', label: 'demó ügyfél' } : { type: 'system', label: 'demó rendszer' },
          message: event.message,
          at: event.at,
        })),
        { type: 'imported', actor: { type: 'system', label: 'kezdeti import' }, message: 'Történeti demó rendelés importálva. Nem kap e-mailt és nem kerül ütemezett feldolgozásba.' },
      ]
      const context: OrderWriteContext = { workflow: true, auditEvents: events, skipStatusNotification: true, suppressSideEffects: true }
      const submission = order.submission
      await payload.create({
        collection: 'orders',
        overrideAccess: true,
        context,
        data: {
          reference: order.reference,
          idempotencyKey: order.idempotencyKey,
          submissionHash: order.submissionHash,
          isDemo: true,
          submittedAt: submission.submittedAt,
          version: 1,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentStatus: order.paymentStatus,
          priceApprovalStatus: order.priceApprovalStatus,
          needsPriceReview: order.needsPriceReview,
          cancellation: order.cancellation ?? { reason: null, note: null, at: null },
          adminNotes: order.adminNotes.map((item) => ({ at: item.at, text: item.text })),
          submission: JSON.parse(JSON.stringify(submission)) as Record<string, unknown>,
          agreed: JSON.parse(JSON.stringify(order.agreed)) as Record<string, unknown>,
          agreedTotals: order.agreed.totals,
          submittedTotals: submission.totals,
          items: submission.lines.map((line) => ({ lineId: line.lineId, productName: line.productName, sku: line.sku, colorHex: line.attributes.colorHex, attributes: line.attributes.colorLabel ?? '', unitPrice: line.unitPrice, quantity: line.quantity, lineTotal: line.lineTotal, catalogUnitPrice: line.catalogUnitPrice })),
          customer: submission.customer,
          billingAddress: submission.billingAddress,
          shippingAddress: submission.shippingAddress ?? {},
          delivery: { methodId: submission.delivery.methodId, kind: submission.delivery.kind, name: submission.delivery.name, fee: submission.delivery.fee },
          note: submission.note,
          terms: submission.terms,
          createdAt: order.createdAt,
        },
      })
      note('demoOrders', 'created')
    } catch (error: unknown) {
      note('demoOrders', 'failed', `${order.reference}: ${errorText(error)}`)
    }
  }
}


export type InitialImportOptions = { skipDemo: boolean; storageReady: boolean; skipReason?: string }

/** Single-threaded by design (scripts/tests); report state is per call. */
export async function runInitialImport(payload: Payload, options: InitialImportOptions): Promise<InitialImportReport> {
  report = { settings: zero(), brands: zero(), categories: zero(), media: zero(), products: zero(), demoOrders: zero() }
  details = []
  try {
    if (options.storageReady) await checkMediaReadiness(payload)
    await importSettings(payload)
    const brandMap = new Map<string, string>()
    const categoryMap = new Map<string, string>()
    await importTaxonomy(payload, 'brands', sampleData.brands, brandMap)
    await importTaxonomy(payload, 'categories', sampleData.categories, categoryMap)
    await importProducts(payload, brandMap, categoryMap, options.storageReady)
    if (!options.skipDemo) await importDemoOrders(payload)
    else note('demoOrders', 'skipped', options.skipReason ?? 'skip-demo')
  } catch (error: unknown) {
    if (!(error instanceof ImportAbortError)) throw error
    return { counts: report, details, aborted: error.message }
  }
  return { counts: report, details, aborted: null }
}
