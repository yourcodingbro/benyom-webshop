import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'

/** An authenticated Payload user with the `admin` role, whether or not the first-login password change is done. */
export function isSignedInAdmin(req: PayloadRequest): boolean {
  const user = req.user
  return Boolean(user && user.collection === 'users' && Array.isArray(user.roles) && user.roles.includes('admin'))
}

/**
 * An admin who may operate: signed in with the `admin` role **and** not waiting for the mandatory
 * first-login password change. Every collection, global and custom admin endpoint uses this, so an
 * admin with a temporary password can do nothing but identify themselves, change the password and log
 * out. `req.user` is loaded from the database on every request, so clearing the flag applies at once.
 * Trusted server workflows use the Local API with `overrideAccess` and are not affected.
 */
export function isAdminRequest(req: PayloadRequest): boolean {
  return isSignedInAdmin(req) && req.user?.collection === 'users' && req.user.mustChangePassword !== true
}

export const adminOnly: Access = ({ req }) => isAdminRequest(req)

export const adminOnlyField: FieldAccess = ({ req }) => isAdminRequest(req)

export const publicRead: Access = () => true

/** Public visitors see published documents only; admins see drafts too. */
export const publishedOrAdmin: Access = ({ req }): boolean | Where => (isAdminRequest(req) ? true : { _status: { equals: 'published' } })

/**
 * Server-only writes: no REST/GraphQL/admin request can create, change or delete these records.
 * Application code writes them through the Local API with `overrideAccess: true`.
 */
export const serverOnly: Access = () => false

/** For secrets such as token hashes: nobody reads them through any API, including admins. */
export const nobody: FieldAccess = () => false
