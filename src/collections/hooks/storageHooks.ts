import { APIError, type CollectionBeforeValidateHook } from 'payload'

import { getServerEnv, getStorageEnv } from '@/config/env'

/** Uploads need Supabase Storage; there is no silent local-disk fallback. Shared by every upload collection. */
export const requireStorage: CollectionBeforeValidateHook = ({ data, req }) => {
  if (req.file && !getStorageEnv(getServerEnv())) {
    throw new APIError('A médiatár nincs beállítva (SUPABASE_* környezeti változók). Feltöltés nem lehetséges.', 503)
  }
  return data
}
