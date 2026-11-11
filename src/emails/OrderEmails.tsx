import type React from 'react'

import { FULFILLMENT_LABELS } from '@/config/labels'
import { EmailLayout, OrderItems, PAYMENT_EXPLANATION, Paragraph } from '@/emails/EmailLayout'
import { formatDateTime } from '@/lib/format'
import type { FulfillmentStatus, Order } from '@/types/order'
import type { StoreSettings } from '@/types/settings'

type OrderEmailProps = {
  order: Order
  settings: StoreSettings
}

export function orderReceivedSubject(order: Order): string {
  return `Előrendelését megkaptuk – ${order.reference}`
}

export function OrderReceivedEmail(props: OrderEmailProps): React.JSX.Element {
  const { order } = props
  return (
    <EmailLayout
      settings={props.settings}
      preview={orderReceivedSubject(order)}
      heading="Köszönjük előrendelését!"
      closing={[`Átvétel módja: ${order.submission.delivery.name}.`, 'A rendelés minden fontos lépéséről e-mailben értesítjük.']}
    >
      <Paragraph>Kedves {order.submission.customer.name}!</Paragraph>
      <Paragraph>
        Megkaptuk {order.reference} azonosítójú előrendelését ({formatDateTime(order.submission.submittedAt)}).
      </Paragraph>
      <Paragraph>{PAYMENT_EXPLANATION}</Paragraph>
      <Paragraph>A rendelés ára rögzített. Ha a beszerzési ár megváltozna, árváltozási ajánlatot küldünk – az ár csak az Ön kifejezett elfogadásával módosulhat.</Paragraph>
      <OrderItems order={order} />
    </EmailLayout>
  )
}

export function storeNewOrderSubject(order: Order): string {
  return `Új előrendelés: ${order.reference}`
}

export function StoreNewOrderEmail(props: OrderEmailProps): React.JSX.Element {
  const { order } = props
  const customer = order.submission.customer
  return (
    <EmailLayout settings={props.settings} preview={storeNewOrderSubject(order)} heading={`Új előrendelés érkezett (${order.reference})`}>
      <Paragraph>
        Ügyfél: {customer.name} · {customer.email} · {customer.phone}
      </Paragraph>
      <Paragraph>Átvétel: {order.submission.delivery.name}</Paragraph>
      <Paragraph>
        {order.needsPriceReview ? 'Figyelem: legalább egy tétel érvényes ajánlati ára alacsonyabb a jelenlegi katalógusárnál – árellenőrzés javasolt.' : 'Árellenőrzés nem szükséges.'}
      </Paragraph>
      {order.submission.note ? <Paragraph>Megjegyzés: {order.submission.note}</Paragraph> : null}
      <OrderItems order={order} />
    </EmailLayout>
  )
}

const FULFILLMENT_TEXT: Partial<Record<FulfillmentStatus, string>> = {
  confirmed: 'Előrendelését visszaigazoltuk, és hamarosan megkezdjük a beszerzést.',
  procurement_in_progress: 'A termék beszerzése folyamatban van.',
  ready_for_collection: 'Rendelése átvehető. A vételárat átvételkor, a helyszínen kell kiegyenlíteni.',
  dispatched: 'Rendelését átadtuk a futárszolgálatnak. A vételárat a futárnál kell kiegyenlíteni.',
  completed: 'Rendelése teljesült. Köszönjük, hogy nálunk vásárolt!',
}

type FulfillmentUpdateEmailProps = OrderEmailProps & {
  status: FulfillmentStatus
}

export function fulfillmentUpdateSubject(order: Order, status: FulfillmentStatus): string {
  return `Rendelése állapota: ${FULFILLMENT_LABELS[status]} – ${order.reference}`
}

export function FulfillmentUpdateEmail(props: FulfillmentUpdateEmailProps): React.JSX.Element {
  const { order, status, settings } = props
  return (
    <EmailLayout settings={settings} preview={fulfillmentUpdateSubject(order, status)} heading={`Új állapot: ${FULFILLMENT_LABELS[status]}`}>
      <Paragraph>Kedves {order.submission.customer.name}!</Paragraph>
      <Paragraph>{FULFILLMENT_TEXT[status] ?? `Rendelése új állapota: ${FULFILLMENT_LABELS[status]}.`}</Paragraph>
      {status === 'ready_for_collection' ? (
        <>
          <Paragraph>Átvételi hely: {settings.collection.address}</Paragraph>
          <Paragraph>Nyitvatartás: {settings.collection.openingHours.join('; ')}</Paragraph>
        </>
      ) : null}
      <OrderItems order={order} />
    </EmailLayout>
  )
}

export type CancellationReasonKind = 'rejection' | 'timeout' | 'store'

const REASON_TEXT: Record<CancellationReasonKind, string> = {
  rejection: 'Ön elutasította az árváltozási ajánlatot, ezért – a feltételeknek megfelelően – a teljes rendelést töröltük.',
  timeout: 'Az árváltozási ajánlatra az emlékeztetőt követő határidőn belül nem érkezett döntés, ezért a teljes rendelést automatikusan töröltük.',
  store: 'Sajnálattal értesítjük, hogy rendelését töröltük.',
}

type CancellationEmailProps = OrderEmailProps & {
  reason: CancellationReasonKind
}

export function cancellationSubject(order: Order): string {
  return `Rendelését töröltük – ${order.reference}`
}

export function CancellationEmail(props: CancellationEmailProps): React.JSX.Element {
  const { order, reason } = props
  const note = order.cancellation?.note
  return (
    <EmailLayout settings={props.settings} preview={cancellationSubject(order)} heading="Rendelés törölve" closing={['Kérdés esetén keressen minket bizalommal.']}>
      <Paragraph>Kedves {order.submission.customer.name}!</Paragraph>
      <Paragraph>{REASON_TEXT[reason]}</Paragraph>
      {note && reason === 'store' ? <Paragraph>Indoklás: {note}</Paragraph> : null}
      <Paragraph>Mivel online fizetés nem történt, visszatérítésre nincs szükség.</Paragraph>
      <Paragraph>
        Rendelésazonosító: <strong>{order.reference}</strong>
      </Paragraph>
    </EmailLayout>
  )
}
