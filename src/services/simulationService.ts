import 'server-only'

import { areDevToolsEnabled } from '@/config/runtime'
import { getProductById, updateProduct } from '@/dto/products'
import { resetSampleStore } from '@/dto/sample-store'
import { SCHEDULER_AUTH } from '@/lib/authorization'
import { clock, HOUR_MS } from '@/lib/clock'
import { type EmailFailureMode, setEmailFailureMode } from '@/lib/dev-simulation'
import { AppError } from '@/lib/errors'
import { priceChangeService, type SchedulerReport } from '@/services/priceChangeService'
import type { AuthorizationContext } from '@/types/auth'
import type { ProductVariant } from '@/types/catalog'

type SimulationService = {
  advanceClock: (hours: number) => void
  resetClock: () => void
  setEmailFailure: (mode: EmailFailureMode) => void
  /** Simulates one authenticated scheduler run (there is no live cron in sample mode). */
  runScheduler: () => Promise<SchedulerReport>
  /** Changes a catalog price to demonstrate quotes and price-change proposals. */
  changeCatalogPrice: (productId: string, sku: string, percent: number, auth: AuthorizationContext) => Promise<void>
  resetAll: () => void
}

function assertEnabled(): void {
  if (!areDevToolsEnabled()) throw new AppError('FORBIDDEN', 'A fejlesztői eszközök nem érhetők el.')
}

/** Development-only controls. Every method refuses to run when dev tools are disabled. */
export const simulationService: SimulationService = {
  advanceClock(hours: number): void {
    assertEnabled()
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) throw new AppError('VALIDATION', 'Érvénytelen időtartam.')
    clock.advance(hours * HOUR_MS)
  },
  resetClock(): void {
    assertEnabled()
    clock.reset()
  },
  setEmailFailure(mode: EmailFailureMode): void {
    assertEnabled()
    setEmailFailureMode(mode)
  },
  async runScheduler(): Promise<SchedulerReport> {
    assertEnabled()
    return priceChangeService.processDueProposals(SCHEDULER_AUTH)
  },
  async changeCatalogPrice(productId: string, sku: string, percent: number, auth: AuthorizationContext): Promise<void> {
    assertEnabled()
    const product = await getProductById(productId, auth)
    if (!product) throw new AppError('NOT_FOUND', 'A termék nem található.')
    const variants = product.variants.map((variant: ProductVariant) =>
      variant.sku === sku ? { ...variant, price: Math.round((variant.price * (100 + percent)) / 100 / 10) * 10 } : variant,
    )
    await updateProduct(productId, { variants }, auth)
  },
  resetAll(): void {
    assertEnabled()
    resetSampleStore()
    clock.reset()
    setEmailFailureMode({ kind: 'none' })
  },
}
