import type { IsoDateTime } from '@/types/common'

/** A validated message from the public contact form. */
export type ContactMessage = {
  id: string
  /** Client-generated key; repeated submissions with the same key are stored once. */
  submissionKey: string
  name: string
  email: string
  subject: string
  message: string
  privacyVersion: string
  receivedAt: IsoDateTime
  /** Store notification state; a failed notification can be retried with the same submission key. */
  notificationStatus: 'pending' | 'sent' | 'sent_simulated' | 'failed'
}
