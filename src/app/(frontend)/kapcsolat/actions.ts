'use server'

import { type ContactSubmitResult, contactService } from '@/services/contactService'

export async function submitContactAction(input: unknown): Promise<ContactSubmitResult> {
  try {
    return await contactService.submitContactMessage(input)
  } catch (error: unknown) {
    console.error('[KAPCSOLAT] Váratlan hiba', error instanceof Error ? error.message : 'ismeretlen')
    return { ok: false, message: 'Váratlan hiba történt. Kérjük, próbálja újra később.', fieldErrors: {} }
  }
}
