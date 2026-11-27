import type { HufAmount, IsoDateTime } from '@/types/common'
import type { OrderTotals } from '@/types/order'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'superseded' | 'withdrawn'

/** Delivery state of one proposal-related email. A response period starts only at `sentAt`. */
export type EmailDispatchState = {
  attempts: number
  /** First claim time; anchors the deadline printed in the email so retries are identical. */
  firstAttemptAt: IsoDateTime | null
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
  /**
   * Response periods in hours, snapshotted from the store settings when the proposal was created. Each period starts
   * when its email is successfully submitted; later settings changes never alter this proposal's deadlines.
   */
  responseHours: { initial: number; reminder: number }
  resolvedAt: IsoDateTime | null
  supersedesId: string | null
  supersededById: string | null
  version: number
  /** Historical demo data from the initial import: never processed by the scheduler. */
  isDemo: boolean
}

export type ProposalOutcome = 'accepted' | 'rejected' | 'expired' | 'withdrawn'

export type EmailKind = 'proposal' | 'reminder'
