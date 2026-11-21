import { z } from 'zod'

import type { SpecificationGroup } from '@/types/catalog'

const requiredText = (what: string): z.ZodString => z.string({ error: `${what}: szöveg szükséges.` }).trim().min(1, { error: `${what}: nem lehet üres.` })

/**
 * Product specifications as stored on products (Payload `specifications` field, product page "Specifikáció"):
 * groups with a title and label/value items. Unknown keys are rejected so a typo never disappears silently.
 */
export const specificationsSchema: z.ZodType<SpecificationGroup[]> = z.array(
  z.strictObject(
    {
      title: requiredText('title'),
      items: z.array(z.strictObject({ label: requiredText('label'), value: requiredText('value') }, { error: 'Tulajdonság: {"label": "…", "value": "…"} objektum szükséges.' }), {
        error: 'items: tömb szükséges.',
      }),
    },
    { error: 'Csoport: {"title": "…", "items": […]} objektum szükséges.' },
  ),
  { error: 'JSON-tömb szükséges, pl. [{"title":"Kijelző","items":[{"label":"Méret","value":"6,1 hüvelyk"}]}].' },
)

/** "2. csoport, 1. tulajdonság" style location for an issue path such as [1, "items", 0, "value"]. */
export function specificationIssuePath(path: PropertyKey[]): string {
  const [group, , item] = path
  if (typeof group !== 'number') return ''
  return typeof item === 'number' ? `${group + 1}. csoport, ${item + 1}. tulajdonság` : `${group + 1}. csoport`
}
