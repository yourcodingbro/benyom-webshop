import { Body, Button, Column, Container, Head, Heading, Hr, Html, Preview, Row, Section, Text } from '@react-email/components'
import type React from 'react'

import { describeAttributes } from '@/lib/catalog'
import { formatHuf } from '@/lib/format'
import type { Order } from '@/types/order'
import type { PriceChangeProposal, ProposalLine } from '@/types/proposal'
import type { StoreSettings } from '@/types/settings'

/** benyom.hu-derived email palette (inline styles: email clients ignore stylesheets). */
const COLORS = { red: '#e00000', brandRed: '#ff0000', ink: '#111111', text: '#333333', muted: '#666666', border: '#eeeeee', page: '#f2f2f2' } as const

const FONT: string = "'Open Sans', Arial, sans-serif"
const HEADING_FONT: string = 'Montserrat, Arial, sans-serif'

export const PAYMENT_EXPLANATION: string =
  'Ez előrendelés: most nem kell fizetnie. A vételárat személyes átvételkor vagy kiszállításkor, a helyszínen kell kiegyenlíteni. Online fizetés nincs.'

type EmailLayoutProps = {
  settings: StoreSettings
  preview: string
  heading: string
  children: React.ReactNode
  action?: { label: string; url: string }
  closing?: string[]
}

/** Shared frame: dark header with the red logo bar, white card, footer with contact data. */
export function EmailLayout(props: EmailLayoutProps): React.JSX.Element {
  const { settings } = props
  return (
    <Html lang="hu">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: COLORS.page, fontFamily: FONT, color: COLORS.text }}>
        <Container style={{ maxWidth: '620px', margin: '0 auto', padding: '24px 16px' }}>
          <Section style={{ backgroundColor: COLORS.ink, padding: '18px 24px', borderRadius: '10px 10px 0 0' }}>
            <Text style={{ margin: 0, color: '#ffffff', fontFamily: HEADING_FONT, fontWeight: 700, letterSpacing: '2px', borderLeft: `4px solid ${COLORS.brandRed}`, paddingLeft: '10px' }}>
              {settings.storeName}
            </Text>
          </Section>
          <Section style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '0 0 10px 10px' }}>
            {settings.isSampleContent ? (
              <Text style={{ margin: '0 0 16px', padding: '8px 12px', backgroundColor: '#fff4e5', borderRadius: '6px', fontSize: '13px' }}>
                Mintaüzenet – fejlesztői előnézet, nem valódi rendelés.
              </Text>
            ) : null}
            <Heading as="h1" style={{ fontFamily: HEADING_FONT, fontSize: '21px', margin: '0 0 16px', color: COLORS.ink }}>
              {props.heading}
            </Heading>
            {props.children}
            {props.action ? (
              <Section style={{ margin: '22px 0' }}>
                <Button href={props.action.url} style={{ backgroundColor: COLORS.red, color: '#ffffff', padding: '12px 26px', borderRadius: '999px', fontWeight: 600, textDecoration: 'none' }}>
                  {props.action.label}
                </Button>
              </Section>
            ) : null}
            {(props.closing ?? []).map((line: string) => (
              <Text key={line} style={{ margin: '0 0 10px', lineHeight: '1.55', color: COLORS.muted }}>
                {line}
              </Text>
            ))}
          </Section>
          <Text style={{ fontSize: '12px', color: COLORS.muted, margin: '14px 4px' }}>
            {settings.storeName} · {settings.contact.email} · {settings.contact.phone}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

type ParagraphProps = {
  children: React.ReactNode
}

export function Paragraph(props: ParagraphProps): React.JSX.Element {
  return <Text style={{ margin: '0 0 14px', lineHeight: '1.55', fontSize: '15px' }}>{props.children}</Text>
}

type AmountRowProps = {
  label: string
  value: string
  strong?: boolean
}

function AmountRow(props: AmountRowProps): React.JSX.Element {
  const style = { margin: '4px 0', fontSize: '14px', fontWeight: props.strong ? 700 : 400 }
  return (
    <Row>
      <Column>
        <Text style={style}>{props.label}</Text>
      </Column>
      <Column align="right">
        <Text style={style}>{props.value}</Text>
      </Column>
    </Row>
  )
}

type OrderItemsProps = {
  order: Order
}

/** Line items at the currently agreed prices, with color swatch and attributes. */
export function OrderItems(props: OrderItemsProps): React.JSX.Element {
  const { order } = props
  const totals = order.agreed.totals
  return (
    <Section style={{ margin: '8px 0 18px' }}>
      {order.submission.lines.map((line) => {
        const agreed = order.agreed.lines.find((item) => item.lineId === line.lineId)
        return (
          <Row key={line.lineId} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <Column>
              <Text style={{ margin: '8px 0 2px', fontSize: '14px' }}>{line.productName}</Text>
              <Text style={{ margin: '0 0 8px', fontSize: '13px', color: COLORS.muted }}>
                {line.attributes.colorHex ? (
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: line.attributes.colorHex, border: '1px solid #999999', verticalAlign: 'middle', marginRight: '6px' }} />
                ) : null}
                {describeAttributes(line.attributes)} · {line.sku}
              </Text>
            </Column>
            <Column align="right" style={{ whiteSpace: 'nowrap', fontSize: '14px' }}>
              {line.quantity} × {formatHuf(agreed?.unitPrice ?? line.unitPrice)}
            </Column>
          </Row>
        )
      })}
      <AmountRow label="Termékek" value={formatHuf(totals.itemsTotal)} />
      <AmountRow label={order.submission.delivery.name} value={formatHuf(totals.deliveryFee)} />
      <AmountRow label="Fizetendő átvételkor" value={formatHuf(totals.grandTotal)} strong />
    </Section>
  )
}

type PriceComparisonProps = {
  proposal: PriceChangeProposal
}

/** Old vs new unit prices and totals for a price-change proposal. */
export function PriceComparison(props: PriceComparisonProps): React.JSX.Element {
  const { proposal } = props
  return (
    <Section style={{ margin: '8px 0 18px' }}>
      {proposal.lines.map((line: ProposalLine) => (
        <Text key={line.lineId} style={{ margin: '6px 0', fontSize: '14px' }}>
          {line.productName} ({line.quantity} db): <s>{formatHuf(line.originalUnitPrice)}</s> → <strong>{formatHuf(line.proposedUnitPrice)}</strong>
        </Text>
      ))}
      <Hr style={{ borderColor: COLORS.border }} />
      <AmountRow label="Eredeti végösszeg" value={formatHuf(proposal.originalTotals.grandTotal)} />
      <AmountRow label="Új végösszeg" value={formatHuf(proposal.proposedTotals.grandTotal)} strong />
    </Section>
  )
}
