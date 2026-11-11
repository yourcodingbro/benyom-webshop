import type { CollectionConfig } from 'payload'

import { adminOnly, isAdminRequest } from '@/collections/access'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Felhasználó', plural: 'Felhasználók' },
  admin: { useAsTitle: 'email', group: 'Rendszer' },
  auth: { maxLoginAttempts: 5, lockTime: 15 * 60 * 1000 },
  access: {
    admin: ({ req }) => isAdminRequest(req),
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'roles',
      label: 'Szerepkörök',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['admin'],
      saveToJWT: true,
      options: [{ label: 'Adminisztrátor', value: 'admin' }],
    },
  ],
}
