import { z } from 'zod'

export const createProposalSchema = z.object({
  orderReference: z.string().trim().min(1, { error: 'Hiányzó rendelésazonosító.' }),
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        proposedUnitPrice: z
          .number({ error: 'Adjon meg érvényes árat.' })
          .int({ error: 'Az ár egész forintösszeg legyen.' })
          .min(0, { error: 'Az ár nem lehet negatív.' })
          .max(100_000_000, { error: 'Az ár túl nagy.' }),
      }),
    )
    .min(1, { error: 'Legalább egy tétel árát meg kell adni.' }),
  explanation: z
    .string()
    .trim()
    .min(10, { error: 'Az indoklás legalább 10 karakter legyen.' })
    .max(2000, { error: 'Az indoklás legfeljebb 2000 karakter lehet.' }),
  /** Required to replace an active proposal; never implicit. */
  supersedeActive: z.boolean(),
})

export type CreateProposalInput = z.infer<typeof createProposalSchema>

export const decisionSchema = z.object({
  token: z.string().trim().min(20).max(200),
  decision: z.enum(['accept', 'reject'], { error: 'Érvénytelen döntés.' }),
})

export type DecisionInput = z.infer<typeof decisionSchema>
