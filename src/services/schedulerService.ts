import 'server-only'

import { SCHEDULER_AUTH } from '@/lib/authorization'
import { clock } from '@/lib/clock'
import { emailService, type ProcessReport } from '@/services/emailService'
import { priceChangeService, type SchedulerReport } from '@/services/priceChangeService'

export type SchedulerRun = { ranAt: string; emails: ProcessReport; proposals: SchedulerReport }

type SchedulerService = {
  /**
   * One durable processing tick (Vercel cron, see docs/ordering-and-price-changes.md): due email
   * jobs with backoff, then proposal reminders and expiry. Idempotent and safe to run concurrently
   * or twice; all state lives in the database, nothing in memory or timers.
   */
  runOnce: () => Promise<SchedulerRun>
}

/** Bounded work per tick keeps one invocation well inside the function time limit. */
const EMAIL_BATCH: number = 50

export const schedulerService: SchedulerService = {
  async runOnce(): Promise<SchedulerRun> {
    const emails = await emailService.processDue(EMAIL_BATCH)
    const proposals = await priceChangeService.processDueProposals(SCHEDULER_AUTH)
    return { ranAt: clock.nowIso(), emails, proposals }
  },
}
