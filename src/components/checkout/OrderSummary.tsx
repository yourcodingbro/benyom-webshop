import type React from 'react'

import { ColorSwatch } from '@/components/product/ColorSwatch'
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from '@/config/labels'
import { describeAttributes } from '@/lib/catalog'
import { formatDateTime, formatHuf } from '@/lib/format'
import type { Order } from '@/types/order'

type OrderSummaryProps = {
  order: Order
}

/** Order details from the immutable snapshot, priced with the currently agreed prices. */
export function OrderSummary(props: OrderSummaryProps): React.JSX.Element {
  const { order } = props
  const { submission, agreed } = order
  return (
    <div className="space-y-6">
      <dl className="grid gap-3 rounded-xl bg-muted p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Rendelésazonosító</dt>
          <dd className="font-heading text-lg font-bold text-ink">{order.reference}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Leadva</dt>
          <dd>{formatDateTime(submission.submittedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Állapot</dt>
          <dd>
            {FULFILLMENT_LABELS[order.fulfillmentStatus]} · {PAYMENT_LABELS[order.paymentStatus]}
          </dd>
        </div>
      </dl>
      <ul className="divide-y rounded-xl border px-4">
        {submission.lines.map((line) => {
          const agreedLine = agreed.lines.find((item) => item.lineId === line.lineId)
          return (
            <li key={line.lineId} className="flex flex-wrap justify-between gap-2 py-3">
              <div>
                <p className="font-semibold">{line.productName}</p>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {line.attributes.colorHex ? <ColorSwatch hex={line.attributes.colorHex} size="xs" /> : null}
                  {describeAttributes(line.attributes)} · {line.sku}
                </p>
              </div>
              <p className="text-right">
                {line.quantity} × {formatHuf(agreedLine?.unitPrice ?? line.unitPrice)}
              </p>
            </li>
          )
        })}
      </ul>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Termékek</dt>
          <dd>{formatHuf(agreed.totals.itemsTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{submission.delivery.name}</dt>
          <dd>{formatHuf(agreed.totals.deliveryFee)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold text-ink">
          <dt>Fizetendő átvételkor</dt>
          <dd>{formatHuf(agreed.totals.grandTotal)}</dd>
        </div>
      </dl>
    </div>
  )
}
