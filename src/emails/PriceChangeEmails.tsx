import type React from 'react'

import { EmailLayout, Paragraph, PriceComparison } from '@/emails/EmailLayout'
import { formatDateTime, formatHuf } from '@/lib/format'
import type { IsoDateTime } from '@/types/common'
import type { Order } from '@/types/order'
import type { PriceChangeProposal } from '@/types/proposal'
import type { StoreSettings } from '@/types/settings'

type ProposalEmailBaseProps = {
  order: Order
  proposal: PriceChangeProposal
  settings: StoreSettings
}

const CONSEQUENCES: string[] = [
  'Elfogadás esetén az új ár lesz a rendelés érvényes ára, és a rendelés teljesítését folytatjuk.',
  'Elutasítás esetén a TELJES rendelés azonnal törlődik.',
  'A gombra kattintva egy döntési oldal nyílik meg; a rendelés csak az ott kifejezetten megerősített döntéssel változik.',
]

function Consequences(): React.JSX.Element {
  return (
    <>
      {CONSEQUENCES.map((line: string) => (
        <Paragraph key={line}>{line}</Paragraph>
      ))}
    </>
  )
}

type PriceChangeProposalEmailProps = ProposalEmailBaseProps & {
  decisionUrl: string
  earliestCancellation: IsoDateTime
}

export function proposalSubject(order: Order): string {
  return `Árváltozás – döntés szükséges (${order.reference})`
}

export function PriceChangeProposalEmail(props: PriceChangeProposalEmailProps): React.JSX.Element {
  const { order, proposal } = props
  return (
    <EmailLayout settings={props.settings} preview={proposalSubject(order)} heading="Árváltozás a rendelésében" action={{ label: 'Döntés az árváltozásról', url: props.decisionUrl }}>
      <Paragraph>Kedves {order.submission.customer.name}!</Paragraph>
      <Paragraph>
        A(z) {order.reference} azonosítójú előrendelésében szereplő termék(ek) ára megváltozott. Indoklás: {proposal.explanation}
      </Paragraph>
      <Paragraph>Rendelése addig nem kerül teljesítésre, amíg nem dönt. Az eredeti ár az Ön elfogadása nélkül nem változik.</Paragraph>
      <Consequences />
      <Paragraph>
        Válaszhatáridő: ha 24 órán belül nem dönt, emlékeztetőt küldünk. Ha az emlékeztető kiküldését követő 24 órán belül sem érkezik döntés, a teljes rendelés automatikusan törlődik (legkorábban {formatDateTime(props.earliestCancellation)}).
      </Paragraph>
      <PriceComparison proposal={proposal} />
    </EmailLayout>
  )
}

type PriceChangeReminderEmailProps = ProposalEmailBaseProps & {
  decisionUrl: string
  deadline: IsoDateTime
}

export function reminderSubject(order: Order, deadline: IsoDateTime): string {
  return `Emlékeztető: árváltozás – döntés ${formatDateTime(deadline)}-ig (${order.reference})`
}

export function PriceChangeReminderEmail(props: PriceChangeReminderEmailProps): React.JSX.Element {
  const { order, proposal } = props
  return (
    <EmailLayout
      settings={props.settings}
      preview={reminderSubject(order, props.deadline)}
      heading="Emlékeztető: döntés szükséges az árváltozásról"
      action={{ label: 'Döntés az árváltozásról', url: props.decisionUrl }}
    >
      <Paragraph>Kedves {order.submission.customer.name}!</Paragraph>
      <Paragraph>
        Még nem döntött a(z) {order.reference} rendelés árváltozási ajánlatáról. Indoklás: {proposal.explanation}
      </Paragraph>
      <Consequences />
      <Paragraph>
        Végső határidő: {formatDateTime(props.deadline)} (budapesti idő). Ha addig nem dönt, a teljes rendelés automatikusan törlődik.
      </Paragraph>
      <PriceComparison proposal={proposal} />
    </EmailLayout>
  )
}

export function acceptedSubject(order: Order): string {
  return `Árváltozás elfogadva – ${order.reference}`
}

export function PriceChangeAcceptedEmail(props: ProposalEmailBaseProps): React.JSX.Element {
  const { order, proposal } = props
  return (
    <EmailLayout settings={props.settings} preview={acceptedSubject(order)} heading="Köszönjük, rögzítettük döntését">
      <Paragraph>Kedves {order.submission.customer.name}!</Paragraph>
      <Paragraph>
        Elfogadta az árváltozást. A rendelés új végösszege: {formatHuf(proposal.proposedTotals.grandTotal)}. A rendelés teljesítését folytatjuk.
      </Paragraph>
      <Paragraph>A fizetés továbbra is átvételkor vagy kiszállításkor történik.</Paragraph>
      <PriceComparison proposal={proposal} />
    </EmailLayout>
  )
}
