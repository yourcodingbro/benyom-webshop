import { getServerEnv } from '@/config/env'
import { safeEqual } from '@/lib/crypto'
import { schedulerService } from '@/services/schedulerService'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Durable processing tick, called every ~5 minutes by GitHub Actions (.github/workflows/process-cron.yml) with
 * `Authorization: Bearer <CRON_SECRET>`. Idempotent and safe under overlap: runs may be delayed, skipped or duplicated.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = getServerEnv().CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return Response.json({ error: 'Nincs jogosultság.' }, { status: 401 })
  const run = await schedulerService.runOnce()
  return Response.json(run)
}
