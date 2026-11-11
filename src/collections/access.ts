import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'

/** True only for an authenticated Payload user with the `admin` role. */
export function isAdminRequest(req: PayloadRequest): boolean {
  const user = req.user
  return Boolean(user && user.collection === 'users' && Array.isArray(user.roles) && user.roles.includes('admin'))
}

export const adminOnly: Access = ({ req }) => isAdminRequest(req)

export const adminOnlyField: FieldAccess = ({ req }) => isAdminRequest(req)

export const publicRead: Access = () => true

/** Public visitors see published documents only; admins see drafts too. */
export const publishedOrAdmin: Access = ({ req }): boolean | Where => (isAdminRequest(req) ? true : { _status: { equals: 'published' } })

/** For secrets such as token hashes: nobody reads them through any API, including admins. */
export const nobody: FieldAccess = () => false
