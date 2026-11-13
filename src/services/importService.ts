import 'server-only'

import { addBrand, getBrands } from '@/dto/brands'
import { addCategory, getCategories } from '@/dto/categories'
import { addProduct, getAllProducts, updateProduct } from '@/dto/products'
import { assertAdminOrSystem } from '@/lib/authorization'
import { canonicalJson } from '@/lib/crypto'
import { parseCsv } from '@/lib/csv'
import { normalizeHexColor } from '@/lib/hex'
import { isValidSlug } from '@/lib/slug'
import type { AuthorizationContext } from '@/types/auth'
import type { Brand, Category, Orderability, Product, ProductImage, ProductVariant, PublicationStatus } from '@/types/catalog'
import { claimImportJob, createImportJob, finishImportJob, getImportJob, recordImportGroup } from '@/dto/import-jobs'
import { clock } from '@/lib/clock'
import { AppError } from '@/lib/errors'
import type { ImportAction, ImportCounts, ImportGroupResult, ImportJob, ImportJobView, ImportReport, ImportRowError } from '@/types/import'

export type { ImportJobView }

export const CSV_DELIMITER: string = ';'
export const MAX_CSV_BYTES: number = 1_000_000

export const CSV_COLUMNS: readonly string[] = [
  'product_id', 'product_slug', 'product_name', 'model', 'brand_slug', 'brand_name', 'category_slugs', 'category_names',
  'status', 'featured', 'product_orderability', 'description', 'sku', 'color_hex', 'color_label', 'storage_gb', 'ram_gb',
  'case_size_mm', 'price_huf', 'variant_orderability', 'procurement_min_days', 'procurement_max_days', 'image_keys',
]


type ImportService = {
  /** Validates and plans the import without changing anything. */
  previewImport: (csv: string, auth: AuthorizationContext) => Promise<ImportReport>
  /** Applies valid product groups in one call (scripts/tests); groups with any row error are skipped entirely. */
  applyImport: (csv: string, auth: AuthorizationContext) => Promise<ImportReport>
  /** Admin upload: stores the CSV with its dry-run report as a persisted job. */
  createJob: (fileName: string, csv: string, auth: AuthorizationContext) => Promise<ImportJobView>
  /** Applies the job in time-boxed batches; call again until `completed`. Resumes after interruptions. */
  runJob: (id: number, auth: AuthorizationContext) => Promise<ImportJobView>
}

type RowFields = {
  slug?: string
  name?: string
  model?: string
  brandSlug?: string
  brandName?: string
  categorySlugs?: string[]
  categoryNames?: string[]
  status?: PublicationStatus
  featured?: boolean
  productOrderability?: Orderability
  description?: string
  colorHex?: string
  colorLabel?: string
  storageGb?: number
  ramGb?: number
  caseSizeMm?: number
  price?: number
  variantOrderability?: Orderability
  procurementMin?: number
  procurementMax?: number
  imageKeys?: string[]
}

type ImportRow = { row: number; productId: string; sku: string; fields: RowFields }

const ORDERABILITY: Record<string, Orderability> = {
  preorderable: 'preorderable', elorendelheto: 'preorderable',
  temporarily_unavailable: 'temporarily_unavailable', nem_rendelheto: 'temporarily_unavailable',
  discontinued: 'discontinued', megszunt: 'discontinued',
}

function emptyCounts(): ImportCounts {
  return { created: 0, updated: 0, skipped: 0, failed: 0 }
}

/** Parses one row; invalid cells are reported and left undefined (the row's product group then fails). */
function parseRow(cells: string[], header: string[], rowNumber: number, errors: ImportRowError[]): ImportRow {
  const value = (column: string): string | undefined => {
    const index = header.indexOf(column)
    const cell = index >= 0 ? cells[index]?.trim() : undefined
    return cell === '' ? undefined : cell
  }
  const fail = (column: string, message: string): void => {
    errors.push({ row: rowNumber, column, message })
  }
  const int = (column: string, min: number, max: number): number | undefined => {
    const raw = value(column)
    if (raw === undefined) return undefined
    const parsed = Number(raw.replace(/\s/g, ''))
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      fail(column, `Egész szám szükséges (${min}–${max}).`)
      return undefined
    }
    return parsed
  }
  const list = (column: string): string[] | undefined => value(column)?.split('|').map((item: string) => item.trim()).filter(Boolean)

  const productId = value('product_id') ?? ''
  const sku = (value('sku') ?? '').toUpperCase()
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(productId)) fail('product_id', 'Kötelező, stabil azonosító (kisbetű, szám, kötőjel).')
  if (!/^[A-Z0-9][A-Z0-9-]{1,63}$/.test(sku)) fail('sku', 'Kötelező cikkszám (nagybetű, szám, kötőjel).')

  const fields: RowFields = {
    slug: value('product_slug'),
    name: value('product_name'),
    model: value('model'),
    brandSlug: value('brand_slug'),
    brandName: value('brand_name'),
    categorySlugs: list('category_slugs'),
    categoryNames: list('category_names'),
    description: value('description'),
    colorLabel: value('color_label'),
    storageGb: int('storage_gb', 1, 65536),
    ramGb: int('ram_gb', 1, 1024),
    caseSizeMm: int('case_size_mm', 10, 100),
    price: int('price_huf', 1, 100_000_000),
    procurementMin: int('procurement_min_days', 0, 365),
    procurementMax: int('procurement_max_days', 0, 365),
    imageKeys: list('image_keys'),
  }
  for (const [column, slug] of [['product_slug', fields.slug], ['brand_slug', fields.brandSlug]] as const) {
    if (slug !== undefined && !isValidSlug(slug)) fail(column, 'Érvénytelen slug.')
  }
  if (fields.categorySlugs?.some((slug: string) => !isValidSlug(slug))) fail('category_slugs', 'Érvénytelen kategória-slug.')
  const hexRaw = value('color_hex')
  if (hexRaw !== undefined) {
    const hex = normalizeHexColor(hexRaw)
    if (hex) fields.colorHex = hex
    else fail('color_hex', 'A színkód formátuma #RRGGBB legyen.')
  }
  const status = value('status')
  if (status !== undefined) {
    if (status === 'draft' || status === 'published') fields.status = status
    else fail('status', 'Értéke draft vagy published lehet.')
  }
  const featured = value('featured')?.toLowerCase()
  if (featured !== undefined) {
    if (['igen', 'true', '1'].includes(featured)) fields.featured = true
    else if (['nem', 'false', '0'].includes(featured)) fields.featured = false
    else fail('featured', 'Értéke igen vagy nem lehet.')
  }
  for (const [column, key] of [['product_orderability', 'productOrderability'], ['variant_orderability', 'variantOrderability']] as const) {
    const raw = value(column)
    if (raw === undefined) continue
    const mapped = ORDERABILITY[raw.toLowerCase()]
    if (mapped) fields[key] = mapped
    else fail(column, 'Értéke preorderable, temporarily_unavailable vagy discontinued lehet.')
  }
  if (fields.imageKeys?.some((key: string) => /^[a-z]+:/i.test(key) || key.includes('..'))) {
    fail('image_keys', 'Csak meglévő médiakulcs adható meg; távoli URL letöltése nem támogatott.')
  }
  return { row: rowNumber, productId, sku, fields }
}

/** First non-empty value across rows; a different non-empty value in another row is a conflict. */
function groupValue<K extends keyof RowFields>(rows: ImportRow[], key: K, errors: ImportRowError[]): RowFields[K] {
  let found: RowFields[K] = undefined
  for (const row of rows) {
    const current = row.fields[key]
    if (current === undefined) continue
    if (found !== undefined && canonicalJson(found) !== canonicalJson(current)) {
      errors.push({ row: row.row, column: String(key), message: 'Ellentmondó termékszintű érték ugyanazon termék soraiban.' })
    }
    found ??= current
  }
  return found
}

type ImportPlanEntry = { existing: Product | null; next: Product; rows: ImportRow[] }

type ImportPlan = {
  report: ImportReport
  plans: ImportPlanEntry[]
  newBrands: Brand[]
  newCategories: Category[]
}

/** Validates the CSV against current data and plans every product group; changes nothing. */
async function planImport(csv: string, dryRun: boolean, auth: AuthorizationContext): Promise<ImportPlan | ImportReport> {
  assertAdminOrSystem(auth)
  const report: ImportReport = {
    dryRun, delimiter: CSV_DELIMITER, rowCount: 0, products: emptyCounts(), variants: emptyCounts(),
    brandsCreated: [], categoriesCreated: [], errors: [], actions: [],
  }
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) {
    report.errors.push({ row: 0, column: null, message: 'A fájl túl nagy (legfeljebb 1 MB).' })
    return report
  }
  let parsed: { header: string[]; rows: string[][] }
  try {
    parsed = parseCsv(csv, CSV_DELIMITER)
  } catch (error: unknown) {
    report.errors.push({ row: 0, column: null, message: error instanceof Error ? error.message : 'Hibás CSV.' })
    return report
  }
  const unknownColumns = parsed.header.filter((column: string) => !CSV_COLUMNS.includes(column))
  if (!parsed.header.includes('product_id') || !parsed.header.includes('sku')) {
    report.errors.push({ row: 1, column: null, message: 'A fejlécben kötelező a product_id és a sku oszlop.' })
    return report
  }
  if (unknownColumns.length > 0) {
    report.errors.push({ row: 1, column: unknownColumns.join(', '), message: 'Ismeretlen oszlop(ok).' })
    return report
  }
  report.rowCount = parsed.rows.length

  const rowErrors: ImportRowError[] = []
  const rows: ImportRow[] = parsed.rows.map((cells: string[], index: number) => parseRow(cells, parsed.header, index + 2, rowErrors))

  const products = await getAllProducts(auth)
  const brands = await getBrands()
  const categories = await getCategories()
  const skuOwner = new Map(products.flatMap((product: Product) => product.variants.map((variant: ProductVariant) => [variant.sku, product.id] as const)))
  const skuSeen = new Map<string, number>()
  for (const row of rows) {
    const seen = skuSeen.get(row.sku)
    if (seen !== undefined) rowErrors.push({ row: row.row, column: 'sku', message: `Duplikált cikkszám a fájlban (lásd ${seen}. sor).` })
    skuSeen.set(row.sku, row.row)
    const owner = skuOwner.get(row.sku)
    if (owner && owner !== row.productId) rowErrors.push({ row: row.row, column: 'sku', message: `A cikkszám már egy másik termékhez tartozik (${owner}).` })
  }

  const groups = new Map<string, ImportRow[]>()
  for (const row of rows) groups.set(row.productId, [...(groups.get(row.productId) ?? []), row])

  const newBrands = new Map<string, Brand>()
  const newCategories = new Map<string, Category>()
  const plans: ImportPlanEntry[] = []

  for (const [productId, groupRows] of groups) {
    const groupErrors: ImportRowError[] = rowErrors.filter((error: ImportRowError) => groupRows.some((row: ImportRow) => row.row === error.row))
    const cellErrorCount = groupErrors.length
    const pick = <K extends keyof RowFields>(key: K): RowFields[K] => groupValue(groupRows, key, groupErrors)
    const existing = products.find((product: Product) => product.id === productId) ?? null
    const firstRow = groupRows[0]?.row ?? 0

    const slug = pick('slug') ?? existing?.slug
    const name = pick('name') ?? existing?.name
    const brandSlug = pick('brandSlug')
    const brandName = pick('brandName')
    const categorySlugs = pick('categorySlugs')
    const categoryNames = pick('categoryNames')
    if (!slug) groupErrors.push({ row: firstRow, column: 'product_slug', message: 'Új termékhez kötelező.' })
    if (!name) groupErrors.push({ row: firstRow, column: 'product_name', message: 'Új termékhez kötelező.' })
    if (slug && products.some((product: Product) => product.id !== productId && product.slug === slug)) {
      groupErrors.push({ row: firstRow, column: 'product_slug', message: 'Ez a slug már egy másik termékhez tartozik.' })
    }

    let brandId = existing?.brandId
    if (brandSlug) {
      const brand = brands.find((item: Brand) => item.slug === brandSlug) ?? newBrands.get(brandSlug)
      if (brand) brandId = brand.id
      else if (brandName) {
        const created: Brand = { id: `brand-${brandSlug}`, slug: brandSlug, name: brandName, description: '', sortOrder: 100, popularityRank: 100 }
        newBrands.set(brandSlug, created)
        brandId = created.id
      } else groupErrors.push({ row: firstRow, column: 'brand_slug', message: 'Ismeretlen márka; új márkához adja meg a brand_name oszlopot is.' })
    }
    if (!brandId) groupErrors.push({ row: firstRow, column: 'brand_slug', message: 'Új termékhez kötelező.' })

    let categoryIds = existing?.categoryIds
    if (categorySlugs) {
      categoryIds = []
      categorySlugs.forEach((categorySlug: string, index: number) => {
        const category = categories.find((item: Category) => item.slug === categorySlug) ?? newCategories.get(categorySlug)
        const newName = categoryNames?.[index]
        if (category) categoryIds?.push(category.id)
        else if (newName) {
          const created: Category = { id: `cat-${categorySlug}`, slug: categorySlug, name: newName, description: '', sortOrder: 100, popularityRank: 100 }
          newCategories.set(categorySlug, created)
          categoryIds?.push(created.id)
        } else groupErrors.push({ row: firstRow, column: 'category_slugs', message: `Ismeretlen kategória: ${categorySlug} (adja meg a category_names oszlopban a nevét).` })
      })
    }
    if (!categoryIds?.length) groupErrors.push({ row: firstRow, column: 'category_slugs', message: 'Legalább egy kategória kötelező.' })

    const images: ProductImage[] = [...(existing?.images ?? [])]
    const variants: ProductVariant[] = existing ? existing.variants.map((variant: ProductVariant) => ({ ...variant })) : []
    for (const row of groupRows) {
      const fields = row.fields
      const current = variants.find((variant: ProductVariant) => variant.sku === row.sku)
      const price = fields.price ?? current?.price
      if (price === undefined) {
        groupErrors.push({ row: row.row, column: 'price_huf', message: 'Új változathoz kötelező.' })
        continue
      }
      const colorHex = fields.colorHex ?? current?.attributes.colorHex ?? null
      let imageIds = current?.imageIds ?? []
      if (fields.imageKeys) {
        const matched = fields.imageKeys.map((key: string) => images.find((image: ProductImage) => image.objectKey === key))
        if (matched.some((image: ProductImage | undefined) => !image)) {
          groupErrors.push({ row: row.row, column: 'image_keys', message: 'Ismeretlen médiakulcs ennél a terméknél.' })
        }
        imageIds = matched.filter((image: ProductImage | undefined): image is ProductImage => Boolean(image)).map((image: ProductImage) => image.id)
      }
      const minDays = fields.procurementMin ?? current?.procurementEstimate?.minDays
      const maxDays = fields.procurementMax ?? current?.procurementEstimate?.maxDays
      if (minDays !== undefined && maxDays !== undefined && minDays > maxDays) {
        groupErrors.push({ row: row.row, column: 'procurement_max_days', message: 'A maximum nem lehet kisebb a minimumnál.' })
      }
      const next: ProductVariant = {
        sku: row.sku,
        attributes: {
          colorHex,
          colorLabel: fields.colorLabel ?? current?.attributes.colorLabel ?? null,
          storageGb: fields.storageGb ?? current?.attributes.storageGb ?? null,
          ramGb: fields.ramGb ?? current?.attributes.ramGb ?? null,
          caseSizeMm: fields.caseSizeMm ?? current?.attributes.caseSizeMm ?? null,
        },
        price,
        orderability: fields.variantOrderability ?? current?.orderability ?? 'preorderable',
        procurementEstimate: minDays !== undefined && maxDays !== undefined ? { minDays, maxDays } : (current?.procurementEstimate ?? null),
        imageIds,
      }
      if (current) variants[variants.indexOf(current)] = next
      else variants.push(next)
    }

    if (groupErrors.length > 0 || !slug || !name || !brandId || !categoryIds) {
      // Cell errors first; derived "missing field" errors only when no cell error explains them.
      report.errors.push(...(cellErrorCount > 0 ? groupErrors.slice(0, cellErrorCount) : groupErrors))
      report.products.failed += 1
      for (const row of groupRows) report.actions.push({ row: row.row, productId, sku: row.sku, action: 'fail' })
      report.variants.failed += groupRows.length
      continue
    }
    const procurementMin = pick('procurementMin')
    const procurementMax = pick('procurementMax')
    const next: Product = {
      id: productId,
      slug,
      name,
      model: pick('model') ?? existing?.model ?? name,
      brandId,
      categoryIds,
      description: pick('description') ?? existing?.description ?? '',
      specifications: existing?.specifications ?? [],
      images,
      variants,
      status: pick('status') ?? existing?.status ?? 'draft',
      featured: pick('featured') ?? existing?.featured ?? false,
      orderability: pick('productOrderability') ?? existing?.orderability ?? 'preorderable',
      procurementEstimate: existing?.procurementEstimate ?? (procurementMin !== undefined && procurementMax !== undefined ? { minDays: procurementMin, maxDays: procurementMax } : null),
      seo: existing?.seo ?? { title: null, description: null },
      createdAt: existing?.createdAt ?? '',
      updatedAt: existing?.updatedAt ?? '',
    }
    plans.push({ existing, next, rows: groupRows })
  }

  for (const plan of plans) {
    const { existing, next } = plan
    const productChanged = !existing || canonicalJson(existing) !== canonicalJson(next)
    if (!existing) report.products.created += 1
    else if (productChanged) report.products.updated += 1
    else report.products.skipped += 1
    for (const row of plan.rows) {
      const before = existing?.variants.find((variant: ProductVariant) => variant.sku === row.sku)
      const after = next.variants.find((variant: ProductVariant) => variant.sku === row.sku)
      const action: ImportAction['action'] = !before ? 'create' : canonicalJson(before) !== canonicalJson(after) ? 'update' : 'skip'
      report.variants[action === 'create' ? 'created' : action === 'update' ? 'updated' : 'skipped'] += 1
      report.actions.push({ row: row.row, productId: next.id, sku: row.sku, action })
    }
  }
  report.actions.sort((a: ImportAction, b: ImportAction) => a.row - b.row)

  const usedBrandIds = new Set(plans.map((plan) => plan.next.brandId))
  const usedCategoryIds = new Set(plans.flatMap((plan) => plan.next.categoryIds))
  report.brandsCreated = [...newBrands.values()].filter((brand: Brand) => usedBrandIds.has(brand.id)).map((brand: Brand) => brand.slug)
  report.categoriesCreated = [...newCategories.values()].filter((category: Category) => usedCategoryIds.has(category.id)).map((category: Category) => category.slug)

  return {
    report,
    plans,
    newBrands: [...newBrands.values()].filter((brand: Brand) => usedBrandIds.has(brand.id)),
    newCategories: [...newCategories.values()].filter((category: Category) => usedCategoryIds.has(category.id)),
  }
}

/** Early-exit paths above return a bare report; normalize them to a plan with no groups. */
async function plan(csv: string, dryRun: boolean, auth: AuthorizationContext): Promise<ImportPlan> {
  const result = await planImport(csv, dryRun, auth)
  return 'plans' in result ? result : { report: result, plans: [], newBrands: [], newCategories: [] }
}

/**
 * Applies one product group. Brands/categories it needs are created first (idempotently); the product
 * is created or updated through Payload, so the same validation applies as in the admin form.
 * Omitted CSV fields keep their stored values (the plan merges with the existing product).
 */
async function applyGroup(entry: ImportPlanEntry, importPlan: ImportPlan, auth: AuthorizationContext): Promise<ImportGroupResult> {
  const { existing, next } = entry
  const counts = emptyCounts()
  for (const row of entry.rows) {
    const action = importPlan.report.actions.find((item: ImportAction) => item.row === row.row)?.action ?? 'skip'
    counts[action === 'create' ? 'created' : action === 'update' ? 'updated' : action === 'fail' ? 'failed' : 'skipped'] += 1
  }
  const known = { brands: new Set((await getBrands()).map((brand: Brand) => brand.id)), categories: new Set((await getCategories()).map((category: Category) => category.id)) }
  for (const brand of importPlan.newBrands) {
    if (brand.id === next.brandId && !known.brands.has(brand.id)) await addBrand(brand, auth)
  }
  for (const category of importPlan.newCategories) {
    if (next.categoryIds.includes(category.id) && !known.categories.has(category.id)) await addCategory(category, auth)
  }
  const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = next
  const rows = entry.rows.map((row: ImportRow) => row.row)
  if (!existing) {
    await addProduct({ ...fields, id }, auth)
    return { product: 'create', variants: counts, rows, error: null }
  }
  if (canonicalJson(existing) !== canonicalJson(next)) {
    await updateProduct(id, fields, auth)
    return { product: 'update', variants: counts, rows, error: null }
  }
  return { product: 'skip', variants: counts, rows, error: null }
}

/** Builds the final report from the per-group results recorded on the job. */
function reportFromResults(base: ImportReport, results: Record<string, ImportGroupResult>): ImportReport {
  const report: ImportReport = { ...base, dryRun: false, products: emptyCounts(), variants: emptyCounts() }
  report.products.failed = base.products.failed
  report.variants.failed = base.variants.failed
  for (const result of Object.values(results)) {
    const key = result.product === 'create' ? 'created' : result.product === 'update' ? 'updated' : result.product === 'fail' ? 'failed' : 'skipped'
    report.products[key] += 1
    for (const counter of ['created', 'updated', 'skipped', 'failed'] as const) report.variants[counter] += result.variants[counter]
    if (result.error) report.errors.push({ row: result.rows[0] ?? 0, column: null, message: result.error })
  }
  return report
}

/** Wall-clock budget for one apply batch, well under the serverless function limit. */
const BATCH_BUDGET_MS: number = 20_000
const STALE_JOB_MINUTES: number = 2

export const importService: ImportService = {
  async previewImport(csv: string, auth: AuthorizationContext): Promise<ImportReport> {
    return (await plan(csv, true, auth)).report
  },

  async applyImport(csv: string, auth: AuthorizationContext): Promise<ImportReport> {
    const importPlan = await plan(csv, false, auth)
    const results: Record<string, ImportGroupResult> = {}
    for (const entry of importPlan.plans) results[entry.next.id] = await applyGroup(entry, importPlan, auth)
    return importPlan.plans.length > 0 ? reportFromResults(importPlan.report, results) : importPlan.report
  },

  async createJob(fileName: string, csv: string, auth: AuthorizationContext): Promise<ImportJobView> {
    const preview = (await plan(csv, true, auth)).report
    const job = await createImportJob({ fileName, csv, previewReport: preview }, auth)
    return toView(job, new Set(preview.actions.map((action: ImportAction) => action.productId)).size)
  },

  async runJob(id: number, auth: AuthorizationContext): Promise<ImportJobView> {
    const startedAt = Date.now()
    const now = clock.nowIso()
    const staleBefore = new Date(clock.now().getTime() - STALE_JOB_MINUTES * 60_000).toISOString()
    const claimed = await claimImportJob(id, now, staleBefore, auth)
    if (!claimed) {
      const current = await getImportJob(id, auth)
      if (!current) throw new AppError('NOT_FOUND', 'Az importfeladat nem található.')
      return toView(current, null)
    }
    if (claimed.status === 'completed' || claimed.status === 'failed') return toView(claimed, null)
    try {
      // Re-planned against current data: groups finished earlier are skipped via the recorded results.
      const importPlan = await plan(claimed.csv, false, auth)
      const results = { ...claimed.results }
      for (const entry of importPlan.plans) {
        if (results[entry.next.id]) continue
        if (Date.now() - startedAt > BATCH_BUDGET_MS) {
          const job = await finishImportJob(id, { status: 'running', finalReport: null, error: null }, clock.nowIso())
          return toView(job, importPlan.plans.length)
        }
        let result: ImportGroupResult
        try {
          result = await applyGroup(entry, importPlan, auth)
        } catch (error: unknown) {
          const message = error instanceof AppError ? error.message : 'Váratlan hiba a termékcsoport mentésekor.'
          result = { product: 'fail', variants: { ...emptyCounts(), failed: entry.rows.length }, rows: entry.rows.map((row: ImportRow) => row.row), error: `${entry.next.id}: ${message}` }
        }
        results[entry.next.id] = result
        await recordImportGroup(id, entry.next.id, result, clock.nowIso())
      }
      const job = await finishImportJob(id, { status: 'completed', finalReport: reportFromResults(importPlan.report, results), error: null }, clock.nowIso())
      return toView(job, importPlan.plans.length)
    } catch (error: unknown) {
      const message = error instanceof AppError ? error.message : 'Váratlan hiba; a már feldolgozott termékek mentve maradtak. Próbálja újra.'
      const job = await finishImportJob(id, { status: 'failed', finalReport: null, error: message }, clock.nowIso())
      return toView(job, null)
    }
  },
}

function toView(job: ImportJob, totalGroups: number | null): ImportJobView {
  return {
    id: job.id,
    status: job.status,
    fileName: job.fileName,
    previewReport: job.previewReport,
    finalReport: job.finalReport,
    processedGroups: Object.keys(job.results).length,
    totalGroups,
    error: job.error,
  }
}
