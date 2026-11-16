import { z } from 'zod'

const emailAddress = z.email()

/** "Név <cim@domain.hu>" or a bare address. */
const SENDER_PATTERN: RegExp = /^(?:[^<>]{1,100}<([^<>\s]+)>|([^<>\s]+))$/

export function isEmailAddress(value: string): boolean {
  return emailAddress.safeParse(value.trim()).success
}

/** The address part of a sender ("Webshop <rendeles@example.hu>" → rendeles@example.hu), or null if invalid. */
export function senderAddress(value: string): string | null {
  const match = SENDER_PATTERN.exec(value.trim())
  const address = match?.[1] ?? match?.[2] ?? null
  return address && isEmailAddress(address) ? address.trim() : null
}

/** Admin field validator for the sender (Áruház beállításai → Feladó). Empty is allowed: sending then fails with an explanation. */
export function validateSender(value: string | null | undefined): true | string {
  if (!value || !value.trim()) return true
  return senderAddress(value) ? true : 'Érvénytelen feladó. Formátum: „Webshop <rendeles@example.hu>” vagy „rendeles@example.hu”.'
}
