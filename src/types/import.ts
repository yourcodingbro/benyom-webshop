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
}
