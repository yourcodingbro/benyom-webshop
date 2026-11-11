import { describeAttributes } from '@/lib/catalog'
import { formatHuf } from '@/lib/format'
import type { Order } from '@/types/order'
import type { StoreSettings } from '@/types/settings'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char: string) => `&#${char.charCodeAt(0)};`)
}

export type EmailBody = {
  heading: string
  /** Paragraphs of plain text (escaped when rendered). */
  paragraphs: string[]
  /** Pre-rendered, already-escaped HTML blocks inserted after the paragraphs. */
  htmlBlocks?: string[]
  textBlocks?: string[]
  action?: { label: string; url: string }
  closing?: string[]
}

export function renderLayout(settings: StoreSettings, body: EmailBody): { html: string; text: string } {
  const paragraphs = body.paragraphs.map((text: string) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(text)}</p>`).join('')
  const closing = (body.closing ?? []).map((text: string) => `<p style="margin:0 0 10px;line-height:1.55;color:#666666">${escapeHtml(text)}</p>`).join('')
  const action = body.action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(body.action.url)}" style="display:inline-block;background:#e00000;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600">${escapeHtml(body.action.label)}</a></p>`
    : ''
  const sampleNotice = settings.isSampleContent
    ? '<p style="margin:0 0 16px;padding:8px 12px;background:#fff4e5;border-radius:6px;font-size:13px">Mintaüzenet – fejlesztői előnézet, nem valódi rendelés.</p>'
    : ''
  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(body.heading)}</title></head>
<body style="margin:0;background:#f2f2f2;font-family:'Open Sans',Arial,sans-serif;color:#333333">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">
<div style="background:#111111;padding:18px 24px;border-radius:10px 10px 0 0"><span style="color:#ffffff;font-weight:700;letter-spacing:2px;border-left:4px solid #ff0000;padding-left:10px;font-family:Montserrat,Arial,sans-serif">${escapeHtml(settings.storeName)}</span></div>
<div style="background:#ffffff;padding:24px;border-radius:0 0 10px 10px">
${sampleNotice}<h1 style="font-family:Montserrat,Arial,sans-serif;font-size:21px;margin:0 0 16px;color:#111111">${escapeHtml(body.heading)}</h1>
${paragraphs}${(body.htmlBlocks ?? []).join('')}${action}${closing}
</div>
<p style="font-size:12px;color:#666666;margin:14px 4px">${escapeHtml(settings.storeName)} · ${escapeHtml(settings.contact.email)} · ${escapeHtml(settings.contact.phone)}</p>
</div></body></html>`

  const text = [
    body.heading,
    '',
    ...(settings.isSampleContent ? ['[Mintaüzenet – nem valódi rendelés]', ''] : []),
    ...body.paragraphs.flatMap((paragraph: string) => [paragraph, '']),
    ...(body.textBlocks ?? []).flatMap((block: string) => [block, '']),
    ...(body.action ? [`${body.action.label}: ${body.action.url}`, ''] : []),
    ...(body.closing ?? []),
    '',
    `${settings.storeName} · ${settings.contact.email} · ${settings.contact.phone}`,
  ].join('\n')

  return { html, text }
}

/** Items table using the agreed unit prices. */
export function orderItemsHtml(order: Order): string {
  const rows = order.submission.lines
    .map((line) => {
      const agreed = order.agreed.lines.find((item) => item.lineId === line.lineId)
      const swatch = line.attributes.colorHex
        ? `<span style="display:inline-block;width:12px;height:12px;background:${escapeHtml(line.attributes.colorHex)};border:1px solid #999999;vertical-align:middle;margin-right:6px"></span>`
        : ''
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #eeeeee">${escapeHtml(line.productName)}<br><span style="font-size:13px;color:#666666">${swatch}${escapeHtml(describeAttributes(line.attributes))} · ${escapeHtml(line.sku)}</span></td><td style="padding:8px 0;border-bottom:1px solid #eeeeee;text-align:right;white-space:nowrap">${line.quantity} × ${escapeHtml(formatHuf(agreed?.unitPrice ?? line.unitPrice))}</td></tr>`
    })
    .join('')
  const totals = order.agreed.totals
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:14px">${rows}
<tr><td style="padding:6px 0">Termékek</td><td style="text-align:right">${escapeHtml(formatHuf(totals.itemsTotal))}</td></tr>
<tr><td style="padding:6px 0">${escapeHtml(order.submission.delivery.name)}</td><td style="text-align:right">${escapeHtml(formatHuf(totals.deliveryFee))}</td></tr>
<tr><td style="padding:6px 0;font-weight:700">Fizetendő átvételkor</td><td style="text-align:right;font-weight:700">${escapeHtml(formatHuf(totals.grandTotal))}</td></tr></table>`
}

export function orderItemsText(order: Order): string {
  const lines = order.submission.lines.map((line) => {
    const agreed = order.agreed.lines.find((item) => item.lineId === line.lineId)
    return `- ${line.productName} (${describeAttributes(line.attributes)}, ${line.sku}): ${line.quantity} × ${formatHuf(agreed?.unitPrice ?? line.unitPrice)}`
  })
  const totals = order.agreed.totals
  return [...lines, `Termékek: ${formatHuf(totals.itemsTotal)}`, `${order.submission.delivery.name}: ${formatHuf(totals.deliveryFee)}`, `Fizetendő átvételkor: ${formatHuf(totals.grandTotal)}`].join('\n')
}

export const PAYMENT_EXPLANATION: string =
  'Ez előrendelés: most nem kell fizetnie. A vételárat személyes átvételkor vagy kiszállításkor, a helyszínen kell kiegyenlíteni. Online fizetés nincs.'
