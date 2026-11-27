/**
 * General metadata is code-managed (not editable in the admin). Only products, brands and categories have editable
 * SEO fields (their own "SEO" group); see src/lib/metadata.ts. The default title and description below are the values
 * that were configured in the former "SEO alapértékek" store setting.
 */
export const SITE_METADATA = {
  defaultTitle: 'Benyom Webshop – telefonok, tabletek és okosórák előrendelésre',
  defaultDescription: 'Apple és Samsung készülékek előrendelése. Fizetés személyes átvételkor vagy kiszállításkor. (Mintaáruház)',
} as const

/** Descriptions of code-managed pages. */
export const PAGE_DESCRIPTIONS = {
  products: 'Telefonok, tabletek és okosórák előrendelésre a kínálatunkban szereplő márkáktól. Fizetés átvételkor.',
  paymentAndDelivery: 'Fizetés átvételkor vagy kiszállításkor, személyes átvétel és házhozszállítás előrendelés esetén.',
} as const
