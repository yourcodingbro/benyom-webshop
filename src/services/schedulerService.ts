import 'server-only'

import { SCHEDULER_AUTH } from '@/lib/authorization'
import { SLUG_RESERVATION_TTL_MS } from '@/collections/utils/slugs'
import { deleteAbandonedProductMedia, deleteExpiredSlugReservations } from '@/dto/media'
import { clock } from '@/lib/clock'
import { emailService, type ProcessReport } from '@/services/emailService'
import { priceChangeService, type SchedulerReport } from '@/services/priceChangeService'

export type SchedulerRun = { ranAt: string; emails: ProcessReport; proposals: SchedulerReport; media: { abandonedDeleted: number; reservationsExpired: number } }

type SchedulerService = {
  /**
   * One durable processing tick (Vercel cron, see docs/ordering-and-price-changes.md): due email
   * jobs with backoff, then proposal reminders and expiry. Idempotent and safe to run concurrently
   * or twice; all state lives in the database, nothing in memory or timers. Finally, product-form
   * uploads never attached to any product (or saved version) are removed after the slug reservation
   * period, and expired slug reservations are released.
   */
  runOnce: () => Promise<SchedulerRun>
}

/** Bounded work per tick keeps one invocation well inside the function time limit. */
const EMAIL_BATCH: number = 50
const MEDIA_CLEANUP_BATCH: number = 20

export const schedulerService: SchedulerService = {
  async runOnce(): Promise<SchedulerRun> {
    const emails = await emailService.processDue(EMAIL_BATCH)
    const proposals = await priceChangeService.processDueProposals(SCHEDULER_AUTH)
    const now = clock.now()
    const abandonedDeleted = await deleteAbandonedProductMedia(new Date(now.getTime() - SLUG_RESERVATION_TTL_MS), MEDIA_CLEANUP_BATCH, SCHEDULER_AUTH)
    const reservationsExpired = await deleteExpiredSlugReservations(now, SCHEDULER_AUTH)
    return { ranAt: clock.nowIso(), emails, proposals, media: { abandonedDeleted, reservationsExpired } }
  },
}
