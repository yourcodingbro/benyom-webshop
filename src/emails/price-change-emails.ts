import { escapeHtml, renderLayout } from '@/emails/layout'
import { formatDateTime, formatHuf } from '@/lib/format'
import type { IsoDateTime } from '@/types/common'
import type { RenderedEmail } from '@/types/email'
import type { Order } from '@/types/order'
import type { PriceChangeProposal, ProposalLine } from '@/types/proposal'
import type { StoreSettings } from '@/types/settings'

function comparisonHtml(proposal: PriceChangeProposal): string {
  const rows = proposal.lines
    .map(
      (line: ProposalLine) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eeeeee">${escapeHtml(line.productName)} (${line.quantity} db)</td><td style="text-align:right;border-bottom:1px solid #eeeeee"><s>${escapeHtml(formatHuf(line.originalUnitPrice))}</s></td><td style="text-align:right;border-bottom:1px solid #eeeeee;font-weight:600">${escapeHtml(formatHuf(line.proposedUnitPrice))}</td></tr>`,
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 18px"><tr><th style="text-align:left">Tétel</th><th style="text-align:right">Eredeti egységár</th><th style="text-align:right">Új egységár</th></tr>${rows}
<tr><td style="padding:8px 0;font-weight:700">Végösszeg</td><td style="text-align:right"><s>${escapeHtml(formatHuf(proposal.originalTotals.grandTotal))}</s></td><td style="text-align:right;font-weight:700">${escapeHtml(formatHuf(proposal.proposedTotals.grandTotal))}</td></tr></table>`
}

function comparisonText(proposal: PriceChangeProposal): string {
  return [
    ...proposal.lines.map((line: ProposalLine) => `- ${line.productName} (${line.quantity} db): ${formatHuf(line.originalUnitPrice)} → ${formatHuf(line.proposedUnitPrice)}`),
    `Eredeti végösszeg: ${formatHuf(proposal.originalTotals.grandTotal)}`,
    `Új végösszeg: ${formatHuf(proposal.proposedTotals.grandTotal)}`,
  ].join('\n')
}

const CONSEQUENCES: string[] = [
  'Elfogadás esetén az új ár lesz a rendelés érvényes ára, és a rendelés teljesítését folytatjuk.',
  'Elutasítás esetén a TELJES rendelés azonnal törlődik.',
  'A gombra kattintva egy döntési oldal nyílik meg; a rendelés csak az ott kifejezetten megerősített döntéssel változik.',
]

export function renderProposal(order: Order, proposal: PriceChangeProposal, decisionUrl: string, earliestCancellation: IsoDateTime, settings: StoreSettings): RenderedEmail {
  const subject = `Árváltozás – döntés szükséges (${order.reference})`
  const body = renderLayout(settings, {
    heading: 'Árváltozás a rendelésében',
    paragraphs: [
      `Kedves ${order.submission.customer.name}!`,
      `A(z) ${order.reference} azonosítójú előrendelésében szereplő termék(ek) ára megváltozott. Indoklás: ${proposal.explanation}`,
      'Rendelése addig nem kerül teljesítésre, amíg nem dönt. Az eredeti ár az Ön elfogadása nélkül nem változik.',
      ...CONSEQUENCES,
      `Válaszhatáridő: ha 24 órán belül nem dönt, emlékeztetőt küldünk. Ha az emlékeztető kiküldését követő 24 órán belül sem érkezik döntés, a teljes rendelés automatikusan törlődik (legkorábban ${formatDateTime(earliestCancellation)}).`,
    ],
    htmlBlocks: [comparisonHtml(proposal)],
    textBlocks: [comparisonText(proposal)],
    action: { label: 'Döntés az árváltozásról', url: decisionUrl },
  })
  return { subject, ...body }
}

export function renderReminder(order: Order, proposal: PriceChangeProposal, decisionUrl: string, deadline: IsoDateTime, settings: StoreSettings): RenderedEmail {
  const subject = `Emlékeztető: árváltozás – döntés ${formatDateTime(deadline)}-ig (${order.reference})`
  const body = renderLayout(settings, {
    heading: 'Emlékeztető: döntés szükséges az árváltozásról',
    paragraphs: [
      `Kedves ${order.submission.customer.name}!`,
      `Még nem döntött a(z) ${order.reference} rendelés árváltozási ajánlatáról. Indoklás: ${proposal.explanation}`,
      ...CONSEQUENCES,
      `Végső határidő: ${formatDateTime(deadline)} (budapesti idő). Ha addig nem dönt, a teljes rendelés automatikusan törlődik.`,
    ],
    htmlBlocks: [comparisonHtml(proposal)],
    textBlocks: [comparisonText(proposal)],
    action: { label: 'Döntés az árváltozásról', url: decisionUrl },
  })
  return { subject, ...body }
}

export function renderAccepted(order: Order, proposal: PriceChangeProposal, settings: StoreSettings): RenderedEmail {
  const subject = `Árváltozás elfogadva – ${order.reference}`
  const body = renderLayout(settings, {
    heading: 'Köszönjük, rögzítettük döntését',
    paragraphs: [
      `Kedves ${order.submission.customer.name}!`,
      `Elfogadta az árváltozást. A rendelés új végösszege: ${formatHuf(proposal.proposedTotals.grandTotal)}. A rendelés teljesítését folytatjuk.`,
      'A fizetés továbbra is átvételkor vagy kiszállításkor történik.',
    ],
    htmlBlocks: [comparisonHtml(proposal)],
    textBlocks: [comparisonText(proposal)],
  })
  return { subject, ...body }
}
