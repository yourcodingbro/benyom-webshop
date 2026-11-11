import { z } from 'zod'

import { cartLinesSchema } from '@/schemas/common'

const requiredText = (message: string, max: number = 200): z.ZodString =>
  z.string({ error: message }).trim().min(1, { error: message }).max(max, { error: `Legfeljebb ${max} karakter adható meg.` })

const optionalText = (max: number): z.ZodType<string | null, unknown> =>
  z
    .string()
    .trim()
    .max(max, { error: `Legfeljebb ${max} karakter adható meg.` })
    .nullish()
    .transform((value: string | null | undefined) => (value ? value : null))

export const addressSchema = z.object({
  postalCode: z.string().trim().regex(/^\d{4}$/, { error: 'Az irányítószám 4 számjegyből áll.' }),
  city: requiredText('Adja meg a települést.', 100),
  street: requiredText('Adja meg az utcát és a házszámot.', 200),
  country: z.literal('HU', { error: 'Jelenleg csak magyarországi cím adható meg.' }),
})

export const customerSchema = z.object({
  name: requiredText('Adja meg a nevét.', 120),
  email: z.email({ error: 'Adjon meg érvényes e-mail-címet.' }).max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()/-]{7,19}$/, { error: 'Adjon meg érvényes telefonszámot (pl. +36 30 123 4567).' }),
  companyName: optionalText(160),
  taxNumber: z
    .string()
    .trim()
    .nullish()
    .transform((value: string | null | undefined) => (value ? value : null))
    .refine((value: string | null) => value === null || /^\d{8}-\d-\d{2}$/.test(value), {
      error: 'Az adószám formátuma: 12345678-1-12.',
    }),
})

/** Checkout payload from the browser. Prices are deliberately absent: the server computes them. */
export const checkoutSchema = z.object({
  idempotencyKey: z.uuid({ error: 'Érvénytelen kérésazonosító.' }),
  lines: cartLinesSchema.min(1, { error: 'A kosár üres.' }),
  customer: customerSchema,
  billingAddress: addressSchema,
  deliveryMethodId: requiredText('Válasszon szállítási módot.', 64),
  shippingAddress: addressSchema.nullable(),
  note: optionalText(1000),
  termsAccepted: z.literal(true, { error: 'Az előrendeléshez el kell fogadnia az ÁSZF-et.' }),
  privacyAccepted: z.literal(true, { error: 'Kérjük, igazolja, hogy megismerte az adatkezelési tájékoztatót.' }),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
