import type { FulfillmentStatus } from '@/types/order'

/** Allowed fulfillment transitions (shared by orderService and the Payload Orders hook). Cancellation is separate. */
export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  received: ['under_review', 'confirmed'],
  under_review: ['confirmed'],
  confirmed: ['procurement_in_progress'],
  procurement_in_progress: ['ready_for_collection', 'dispatched'],
  ready_for_collection: ['completed'],
  dispatched: ['completed'],
  completed: [],
  cancelled: [],
}

/** No price-change proposals for these orders. */
export const PROPOSAL_INELIGIBLE_STATUSES: readonly FulfillmentStatus[] = ['dispatched', 'completed', 'cancelled']
