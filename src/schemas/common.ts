import { z } from 'zod'

import { TECHNICAL_LIMITS } from '@/config/shop'
import { normalizeHexColor } from '@/lib/hex'

/** Strict `#RRGGBB`, normalized to uppercase. Shared by sample data, Payload and CSV. */
export const hexColorSchema: z.ZodType<string, string> = z
  .string()
  .trim()
  .refine((value: string) => normalizeHexColor(value) !== null, { error: 'A színkód formátuma #RRGGBB legyen (pl. #1C1C1E).' })
  .transform((value: string) => value.toUpperCase())

export const skuSchema: z.ZodString = z
  .string()
  .trim()
  .min(1, { error: 'Hiányzó cikkszám.' })
  .max(64, { error: 'A cikkszám legfeljebb 64 karakter lehet.' })
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, { error: 'A cikkszám csak nagybetűt, számot és kötőjelet tartalmazhat.' })

export const quantitySchema: z.ZodNumber = z
  .number({ error: 'Érvénytelen mennyiség.' })
  .int({ error: 'A mennyiség egész szám legyen.' })
  .min(1, { error: 'A mennyiség legalább 1.' })
  // Technical ceiling only; the configured business limit is checked by lib/cart-limits.ts in the services.
  .max(TECHNICAL_LIMITS.maxLineQuantity, { error: `Tételenként legfeljebb ${TECHNICAL_LIMITS.maxLineQuantity} darab rendelhető.` })

export const cartLineInputSchema = z.object({
  sku: skuSchema,
  quantity: quantitySchema,
  quoteToken: z.string().max(1024).nullable(),
})

export type CartLineInput = z.infer<typeof cartLineInputSchema>

export const cartLinesSchema = z
  .array(cartLineInputSchema)
  .max(TECHNICAL_LIMITS.maxCartLines, { error: `Legfeljebb ${TECHNICAL_LIMITS.maxCartLines} tétel lehet a kosárban.` })
