'use server'

import { redirect } from 'next/navigation'

import { priceChangeService } from '@/services/priceChangeService'

/** POST-only decision. The GET page never mutates; this explicit action does, then redirects (PRG). */
export async function decideAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const decision = String(formData.get('decision') ?? '')
  if (decision === 'reject' && formData.get('confirmReject') !== 'on') {
    redirect(`/arvaltozas/${encodeURIComponent(token)}?hiba=megerosites`)
  }
  const result = await priceChangeService.decide({ token, decision })
  const outcome = result.outcome === 'already_resolved' ? `lezart-${result.status}` : result.outcome
  redirect(`/arvaltozas/${encodeURIComponent(token)}?eredmeny=${outcome}`)
}
