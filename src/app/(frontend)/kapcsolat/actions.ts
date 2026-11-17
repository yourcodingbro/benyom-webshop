'use server'

import { randomUUID } from 'node:crypto'

import { type ContactSubmitResult, contactService } from '@/services/contactService'

export type ContactFormValues = { name: string; email: string; subject: string; message: string }

export type ContactFormState = {
  result: ContactSubmitResult | null
  /** What the visitor entered, returned on failure so the form is refilled (also without JavaScript). */
  values: ContactFormValues | null
  /** Reused by a retry so the same message is never stored or forwarded twice. */
  submissionKey: string | null
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * The contact form's action. Used as `<form action>`, so a submit before the page's JavaScript has loaded
 * still posts to the server (progressive enhancement) instead of a GET that would lose the message and
 * put the visitor's data into the URL.
 */
export async function contactFormAction(_previous: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const values: ContactFormValues = { name: text(formData, 'name'), email: text(formData, 'email'), subject: text(formData, 'subject'), message: text(formData, 'message') }
  const submissionKey = text(formData, 'submissionKey') || randomUUID()
  let result: ContactSubmitResult
  try {
    result = await contactService.submitContactMessage({
      ...values,
      privacyAccepted: formData.get('privacyAccepted') === 'on',
      website: text(formData, 'hp_kapcsolat'),
      formToken: text(formData, 'formToken'),
      submissionKey,
    })
  } catch (error: unknown) {
    // Sanitized: stage and correlation only (the message text and addresses are never logged).
    console.error('[KAPCSOLAT]', { correlationId: `contact-${submissionKey.slice(0, 8)}`, stage: 'unexpected', error: error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'ismeretlen' })
    result = { ok: false, message: 'Váratlan hiba történt, az üzenet nem lett rögzítve. Kérjük, próbálja újra néhány perc múlva.', fieldErrors: {}, stored: false }
  }
  // A stored message keeps its key, so "send again" never creates a second copy.
  return result.ok ? { result, values: null, submissionKey: null } : { result, values, submissionKey }
}
