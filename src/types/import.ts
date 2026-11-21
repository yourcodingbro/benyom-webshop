export type ImportCounts = {
  created: number
  updated: number
  skipped: number
  failed: number
}

export type ImportRowError = {
  row: number
  column: string | null
  message: string
}

export type ImportAction = {
  row: number
  productId: string
  sku: string
  action: 'create' | 'update' | 'skip' | 'fail'
}

export type ImportReport = {
  dryRun: boolean
  delimiter: string
  rowCount: number
  products: ImportCounts
  variants: ImportCounts
  brandsCreated: string[]
  categoriesCreated: string[]
  errors: ImportRowError[]
  actions: ImportAction[]
  /** Per product whose `specifications` cell changes them. Absent in reports stored before the column existed. */
  specificationChanges?: ImportSpecificationChange[]
}

/** What a `specifications` cell will do to one product, shown before the import is confirmed. */
export type ImportSpecificationChange = {
  /** Row that carries the specifications. */
  row: number
  productId: string
  productName: string
  /** "replace": the cell's groups become the product's specifications; "clear": `[]` removes them all. */
  change: 'replace' | 'clear'
  /** "Csoport › Megnevezés: érték" entries. */
  added: string[]
  /** "Csoport › Megnevezés: régi → új" entries. */
  updated: string[]
  /** "Csoport › Megnevezés" entries no longer present. */
  removed: string[]
}

export type ImportJobStatus = 'previewed' | 'running' | 'completed' | 'failed'

/** Outcome of one product group (all rows of one product_id), recorded as soon as it is applied. */
export type ImportGroupResult = {
  product: 'create' | 'update' | 'skip' | 'fail'
  variants: ImportCounts
  rows: number[]
  error: string | null
}

export type ImportJob = {
  id: number
  fileName: string
  status: ImportJobStatus
  csv: string
  previewReport: ImportReport | null
  results: Record<string, ImportGroupResult>
  finalReport: ImportReport | null
  error: string | null
  startedAt: string | null
  heartbeatAt: string | null
  finishedAt: string | null
  createdAt: string
}

/** What the admin import view shows for a job. */
export type ImportJobView = {
  id: number
  status: ImportJobStatus
  fileName: string
  previewReport: ImportReport | null
  finalReport: ImportReport | null
  processedGroups: number
  totalGroups: number | null
  error: string | null
}
