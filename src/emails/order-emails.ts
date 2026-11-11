import { FULFILLMENT_LABELS } from '@/config/labels'
import { escapeHtml, orderItemsHtml, orderItemsText, PAYMENT_EXPLANATION, renderLayout } from '@/emails/layout'
import { formatDateTime } from '@/lib/format'
import type { RenderedEmail } from '@/types/email'
import type { FulfillmentStatus, Order } from '@/types/order'
import type { StoreSettings } from '@/types/settings'

export function renderOrderReceived(order: Order, settings: StoreSettings): RenderedEmail {
  const subject = `Előrendelését megkaptuk – ${order.reference}`
  const body = renderLayout(settings, {
    heading: 'Köszönjük előrendelését!',
    paragraphs: [
      `Kedves ${order.submission.customer.name}!`,
      `Megkaptuk ${order.reference} azonosítójú előrendelését (${formatDateTime(order.submission.submittedAt)}).`,
      PAYMENT_EXPLANATION,
      'A rendelés ára rögzített. Ha a beszerzési ár megváltozna, árváltozási ajánlatot küldünk – az ár csak az Ön kifejezett elfogadásával módosulhat.',
    ],
    htmlBlocks: [orderItemsHtml(order)],
    textBlocks: [orderItemsText(order)],
    closing: [`Átvétel módja: ${order.submission.delivery.name}.`, 'A rendelés minden fontos lépéséről e-mailben értesítjük.'],
  })
  return { subject, ...body }
}

export function renderStoreNewOrder(order: Order, settings: StoreSettings): RenderedEmail {
  const customer = order.submission.customer
  const subject = `Új előrendelés: ${order.reference}`
  const body = renderLayout(settings, {
    heading: `Új előrendelés érkezett (${order.reference})`,
    paragraphs: [
      `Ügyfél: ${customer.name} · ${customer.email} · ${customer.phone}`,
      `Átvétel: ${order.submission.delivery.name}`,
      order.needsPriceReview ? 'Figyelem: legalább egy tétel érvényes ajánlati ára alacsonyabb a jelenlegi katalógusárnál – árellenőrzés javasolt.' : 'Árellenőrzés nem szükséges.',
      ...(order.submission.note ? [`Megjegyzés: ${order.submission.note}`] : []),
    ],
    htmlBlocks: [orderItemsHtml(order)],
    textBlocks: [orderItemsText(order)],
  })
  return { subject, ...body }
}

const FULFILLMENT_TEXT: Partial<Record<FulfillmentStatus, string>> = {
  confirmed: 'Előrendelését visszaigazoltuk, és hamarosan megkezdjük a beszerzést.',
  procurement_in_progress: 'A termék beszerzése folyamatban van.',
  ready_for_collection: 'Rendelése átvehető. A vételárat átvételkor, a helyszínen kell kiegyenlíteni.',
  dispatched: 'Rendelését átadtuk a futárszolgálatnak. A vételárat a futárnál kell kiegyenlíteni.',
  completed: 'Rendelése teljesült. Köszönjük, hogy nálunk vásárolt!',
}

export function renderFulfillmentUpdate(order: Order, status: FulfillmentStatus, settings: StoreSettings): RenderedEmail {
  const subject = `Rendelése állapota: ${FULFILLMENT_LABELS[status]} – ${order.reference}`
  const collection =
    status === 'ready_for_collection'
      ? [`Átvételi hely: ${settings.collection.address}`, `Nyitvatartás: ${settings.collection.openingHours.join('; ')}`]
      : []
  const body = renderLayout(settings, {
    heading: `Új állapot: ${FULFILLMENT_LABELS[status]}`,
    paragraphs: [`Kedves ${order.submission.customer.name}!`, FULFILLMENT_TEXT[status] ?? `Rendelése új állapota: ${FULFILLMENT_LABELS[status]}.`, ...collection],
    htmlBlocks: [orderItemsHtml(order)],
    textBlocks: [orderItemsText(order)],
  })
  return { subject, ...body }
}

export function renderCancellation(order: Order, settings: StoreSettings, reason: 'rejection' | 'timeout' | 'store'): RenderedEmail {
  const reasonText: Record<typeof reason, string> = {
    rejection: 'Ön elutasította az árváltozási ajánlatot, ezért – a feltételeknek megfelelően – a teljes rendelést töröltük.',
    timeout: 'Az árváltozási ajánlatra az emlékeztetőt követő határidőn belül nem érkezett döntés, ezért a teljes rendelést automatikusan töröltük.',
    store: 'Sajnálattal értesítjük, hogy rendelését töröltük.',
  }
  const subject = `Rendelését töröltük – ${order.reference}`
  const note = order.cancellation?.note
  const body = renderLayout(settings, {
    heading: 'Rendelés törölve',
    paragraphs: [
      `Kedves ${order.submission.customer.name}!`,
      reasonText[reason],
      ...(note && reason === 'store' ? [`Indoklás: ${note}`] : []),
      'Mivel online fizetés nem történt, visszatérítésre nincs szükség.',
    ],
    htmlBlocks: [`<p style="margin:0 0 14px">Rendelésazonosító: <strong>${escapeHtml(order.reference)}</strong></p>`],
    textBlocks: [`Rendelésazonosító: ${order.reference}`],
    closing: ['Kérdés esetén keressen minket bizalommal.'],
  })
  return { subject, ...body }
}
