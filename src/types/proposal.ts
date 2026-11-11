import type { HufAmount, IsoDateTime } from '@/types/common'
import type { OrderTotals } from '@/types/order'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'superseded' | 'withdrawn'

/** Delivery state of one proposal-related email. A response period starts only at `sentAt`. */
export type EmailDispatchState = {
  attempts: number
  lastAttemptAt: IsoDateTime | null
  lastError: string | null
  /** Set while a sender holds the claim; prevents duplicate sends under concurrency. */
  claimedAt: IsoDateTime | null
  sentAt: IsoDateTime | null
}

export type ProposalLine = {
  lineId: string
  sku: string
  productName: string
  quantity: number
  originalUnitPrice: HufAmount
  proposedUnitPrice: HufAmount
}

export type PriceChangeProposal = {
  id: string
  orderReference: string
  status: ProposalStatus
  lines: ProposalLine[]
  originalTotals: OrderTotals
  proposedTotals: OrderTotals
  explanation: string
  /** SHA-256 hashes of decision tokens. Raw tokens exist only inside sent emails. */
  tokenHashes: string[]
  createdAt: IsoDateTime
  createdBy: string
  proposalEmail: EmailDispatchState
  reminderEmail: EmailDispatchState
  resolvedAt: IsoDateTime | null
  supersedesId: string | null
  supersededById: string | null
  version: number
}

export type ProposalOutcome = 'accepted' | 'rejected' | 'expired' | 'withdrawn'

export type EmailKind = 'proposal' | 'reminder'
