import { z } from 'zod'

export const CONTACT_LIMITS = { name: 100, email: 200, subject: 150, message: 3000 } as const

const text = (min: number, max: number, required: string, tooShort: string): z.ZodString =>
  z
    .string({ error: required })
    .trim()
    .min(1, { error: required })
    .min(min, { error: tooShort })
    .max(max, { error: `Legfeljebb ${max} karakter adható meg.` })

/** Fields typed by the visitor. Shared by the client form and the server. */
export const contactFieldsSchema = z.object({
  name: text(2, CONTACT_LIMITS.name, 'Adja meg a nevét.', 'A név legalább 2 karakter legyen.'),
  email: z.email({ error: 'Adjon meg érvényes e-mail-címet.' }).max(CONTACT_LIMITS.email, { error: `Legfeljebb ${CONTACT_LIMITS.email} karakter adható meg.` }),
  subject: text(3, CONTACT_LIMITS.subject, 'Adja meg az üzenet tárgyát.', 'A tárgy legalább 3 karakter legyen.'),
  message: text(10, CONTACT_LIMITS.message, 'Írja meg az üzenetét.', 'Az üzenet legalább 10 karakter legyen.'),
  privacyAccepted: z.literal(true, { error: 'Kérjük, igazolja, hogy megismerte az adatkezelési tájékoztatót.' }),
})

export type ContactFields = z.infer<typeof contactFieldsSchema>

/** Full payload: fields plus duplicate-prevention key and anti-spam data. */
export const contactSubmissionSchema = contactFieldsSchema.extend({
  submissionKey: z.uuid({ error: 'Érvénytelen kérésazonosító.' }),
  formToken: z.string().max(200),
  /** Honeypot: hidden from people, must stay empty. */
  website: z.string().max(200),
})
