/** Parses typed text: positive integers up to `max` only. */
export function parseQuantity(text: string, max: number): { value: number } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { error: 'Adja meg a mennyiséget.' }
  if (!/^\d+$/.test(trimmed)) return { error: 'Csak pozitív egész szám adható meg.' }
  const value = Number(trimmed)
  if (value < 1) return { error: 'A mennyiség legalább 1.' }
  if (value > max) return { error: `Tételenként legfeljebb ${max} db rendelhető.` }
  return { value }
}
