import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getProposalsForOrder } from '@/dto/price-change-proposals'
import { getHomepageSettings, getPaymentSettings, getPublishedFaqs, getSiteChrome, getStoreSettings } from '@/dto/settings'
import { SCHEDULER_AUTH } from '@/lib/authorization'
import { HOUR_MS, clock } from '@/lib/clock'
import { describeDeliveryFee } from '@/lib/delivery'
import { entityMetadata } from '@/lib/metadata'
import { priceChangeService } from '@/services/priceChangeService'
import { ADMIN, enableResendMode, placeTestOrder, resetWorld, testPayload } from '@/tests/helpers'
import { acceptAll } from '@/tests/resend-mock'
import type { FeaturedLayout } from '@/types/settings'

vi.mock('resend', async (importOriginal) => (await import('@/tests/resend-mock')).mockResendModule(await importOriginal()))

beforeEach(async () => {
  await resetWorld()
  acceptAll()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const featured = (count: number, columns: number, rows: number): FeaturedLayout => ({ heading: 'Kiemelt termékek', count, columns, rows })

describe('content settings (Áruház, Email, Főoldal beállítások; Fejléc, Lábléc, GYIK tabs)', () => {
  it('keeps the former hardcoded content after the migration: payment page, listing titles, limits, hero labels, slogan, FAQ', async () => {
    const settings = await getStoreSettings()
    expect(await getHomepageSettings()).toMatchObject({ heroPrimaryLabel: 'Termékek böngészése', heroSecondaryLabel: 'Hogyan működik?', featured: featured(8, 4, 2) })
    const payment = await getPaymentSettings()
    expect(payment.paymentPage.title).toBe('Fizetés és szállítás')
    expect(payment.deliveryMethods.map((method) => method.id)).toEqual(['szemelyes-atvetel', 'hazhozszallitas', 'csomagautomata'])
    expect(payment.paymentPage.paymentItems).toHaveLength(3)
    expect(payment.paymentPage.processSteps).toHaveLength(4)
    expect(settings.limits).toEqual({ maxLineQuantity: 5, maxCartLines: 20, priceChangeResponseHours: 24, priceChangeReminderHours: 24 })
    expect((await getSiteChrome()).footerSlogan).toMatch(/^Előrendelés online/)
    expect((await getSiteChrome()).logo).toBeNull()
    expect((await getPublishedFaqs()).map((faq) => faq.question)).toEqual(['Kell-e online fizetnem?', 'Változhat-e a rendelésem ára?', 'Mi történik, ha nem válaszolok az árváltozási ajánlatra?'])
    // General SEO is code-managed: no such field on the settings any more.
    const raw = await (await testPayload()).findGlobal({ slug: 'store-settings', overrideAccess: true })
    expect(raw).not.toHaveProperty('seo')
  })

  it('validates the featured grid: the product count must fit rows × columns', async () => {
    const payload = await testPayload()
    const save = async (layout: FeaturedLayout): Promise<unknown> => payload.updateGlobal({ slug: 'homepage-settings', data: { featured: layout }, overrideAccess: true })
    for (const ok of [featured(3, 3, 1), featured(6, 3, 2), featured(8, 4, 2), featured(5, 3, 2)]) {
      await save(ok)
      expect((await getHomepageSettings()).featured).toEqual(ok)
    }
    // Payload reports the field's own Hungarian message under data.errors.
    await expect(save(featured(9, 4, 2))).rejects.toMatchObject({ data: { errors: [expect.objectContaining({ message: expect.stringMatching(/Legfeljebb 8 termék fér el \(2 sor × 4 oszlop\)/) })] } })
    await expect(save(featured(3, 5, 1))).rejects.toThrow()
    await expect(save(featured(0, 3, 1))).rejects.toThrow()
    await expect(save(featured(2.5, 3, 1))).rejects.toThrow()
  })

  it('shows only published FAQ entries, in the manual order', async () => {
    const payload = await testPayload()
    const all = await payload.find({ collection: 'faqs', sort: '_order', overrideAccess: true })
    const [first, second] = all.docs
    await payload.update({ collection: 'faqs', id: second?.id ?? 0, data: { published: false }, overrideAccess: true })
    expect((await getPublishedFaqs()).map((faq) => faq.question)).not.toContain(second?.question)
    // Moving the first entry to the end: Payload's order keys sort byte-wise (COLLATE "C").
    await payload.update({ collection: 'faqs', id: first?.id ?? 0, data: { _order: 'z9' } as never, overrideAccess: true })
    expect((await getPublishedFaqs()).at(-1)?.question).toBe(first?.question)
    // Visitors cannot read an unpublished entry through the API either.
    const visible = await payload.find({ collection: 'faqs', overrideAccess: false })
    expect(visible.docs.some((doc) => doc.id === second?.id)).toBe(false)
  })

  it('renders the delivery fee with the shared HUF formatter (no stray $)', () => {
    // Hungarian formatting groups from five digits on (2990 Ft, 12 990 Ft); the old page printed "Díj: $…".
    expect(describeDeliveryFee({ kind: 'fixed', amount: 2990 })).toMatch(/^2990\sFt$/)
    expect(describeDeliveryFee({ kind: 'fixed', amount: 12990 })).toMatch(/^12\s990\sFt$/)
    expect(describeDeliveryFee({ kind: 'fixed', amount: 2990 })).not.toContain('$')
    expect(describeDeliveryFee({ kind: 'free' })).toBe('Ingyenes')
  })

  it('uses editable SEO values in standard, Open Graph and Twitter metadata, falling back only when empty', () => {
    const withSeo = entityMetadata({ seo: { title: 'SEO cím', description: 'SEO leírás' }, fallbackTitle: 'Név', fallbackDescription: 'Leírás', canonical: '/marka/apple' })
    expect(withSeo).toMatchObject({ title: 'SEO cím', description: 'SEO leírás', alternates: { canonical: '/marka/apple' }, openGraph: { title: 'SEO cím', description: 'SEO leírás', url: '/marka/apple' }, twitter: { title: 'SEO cím', description: 'SEO leírás' } })
    const fallback = entityMetadata({ seo: { title: null, description: null }, fallbackTitle: 'Név', fallbackDescription: 'Leírás', canonical: '/kategoria/tablet' })
    expect(fallback).toMatchObject({ title: 'Név', description: 'Leírás', openGraph: { title: 'Név' }, twitter: { title: 'Név' } })
  })

  it('saves brand and category SEO fields and reads them back (blank values fall back)', async () => {
    const payload = await testPayload()
    await payload.update({ collection: 'brands', id: 'brand-apple', data: { seo: { title: 'Apple előrendelés', description: '  ' } }, overrideAccess: true })
    const { getBrandBySlug } = await import('@/dto/brands')
    expect((await getBrandBySlug('apple'))?.seo).toEqual({ title: 'Apple előrendelés', description: null })
  })

  it('snapshots the price-change response periods when a proposal starts; later settings changes do not move its deadlines', async () => {
    await enableResendMode()
    const payload = await testPayload()
    const setHours = async (initial: number, reminder: number): Promise<void> => {
      await payload.updateGlobal({ slug: 'store-settings', data: { limits: { ...(await getStoreSettings()).limits, priceChangeResponseHours: initial, priceChangeReminderHours: reminder } }, overrideAccess: true })
    }
    await setHours(48, 12)
    const order = await placeTestOrder()
    const lineId = order.submission.lines[0]?.lineId ?? ''
    await priceChangeService.createProposal({ orderReference: order.reference, lines: [{ lineId, proposedUnitPrice: 469990 }], explanation: 'A beszállítói ár emelkedett.', supersedeActive: false }, ADMIN)
    const proposal = (await getProposalsForOrder(order.reference, ADMIN))[0]
    if (!proposal) throw new Error('proposal missing')
    expect(proposal.responseHours).toEqual({ initial: 48, reminder: 12 })
    const sentAt = proposal.proposalEmail.sentAt ?? ''
    expect(sentAt).not.toBe('')
    expect(priceChangeService.getDeadlines(proposal).reminderDueAt).toBe(new Date(new Date(sentAt).getTime() + 48 * HOUR_MS).toISOString())

    // Shorter periods in the settings now: the running proposal keeps 48 h, so no reminder after 7 h.
    await setHours(6, 6)
    clock.advance(7 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(0)
    expect((await getProposalsForOrder(order.reference, ADMIN))[0]?.responseHours).toEqual({ initial: 48, reminder: 12 })
    clock.advance(42 * HOUR_MS)
    expect((await priceChangeService.processDueProposals(SCHEDULER_AUTH)).remindersSent).toBe(1)
  })
})
