import type { VariantDimension } from '@/lib/variant-selection'
import type { Orderability, ProductSort } from '@/types/catalog'
import type { FulfillmentStatus, PaymentStatus, PriceApprovalStatus } from '@/types/order'
import type { ProposalStatus } from '@/types/proposal'

export const ORDERABILITY_LABELS: Record<Orderability, string> = {
  preorderable: 'Előrendelhető',
  temporarily_unavailable: 'Átmenetileg nem rendelhető',
  discontinued: 'Megszűnt termék',
}

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  received: 'Beérkezett',
  under_review: 'Ellenőrzés alatt',
  confirmed: 'Visszaigazolva',
  procurement_in_progress: 'Beszerzés folyamatban',
  ready_for_collection: 'Átvehető',
  dispatched: 'Kiszállítás alatt',
  completed: 'Teljesítve',
  cancelled: 'Törölve',
}

export function isFulfillmentStatus(value: string): value is FulfillmentStatus {
  return Object.hasOwn(FULFILLMENT_LABELS, value)
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Fizetés átvételkor',
  paid: 'Kifizetve',
  void: 'Nem esedékes',
}

export const PRICE_APPROVAL_LABELS: Record<PriceApprovalStatus, string> = {
  not_required: 'Nincs szükség',
  pending: 'Ügyfél döntésére vár',
  accepted: 'Elfogadva',
  rejected: 'Elutasítva',
  expired: 'Lejárt',
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: 'Döntésre vár',
  accepted: 'Elfogadva',
  rejected: 'Elutasítva',
  expired: 'Lejárt',
  superseded: 'Felülírva',
  withdrawn: 'Visszavonva',
}

export const VARIANT_DIMENSION_LABELS: Record<VariantDimension, string> = {
  colorHex: 'Szín',
  storageGb: 'Tárhely',
  caseSizeMm: 'Tokméret',
  ramGb: 'Memória (RAM)',
}

export const SORT_LABELS: Record<ProductSort, string> = {
  featured: 'Kiemelt',
  price_asc: 'Ár szerint növekvő',
  price_desc: 'Ár szerint csökkenő',
  name_asc: 'Név szerint (A–Z)',
  newest: 'Legújabb',
}
