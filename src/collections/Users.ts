import {
  APIError,
  type Access,
  type CollectionBeforeLoginHook,
  type CollectionConfig,
  type Where,
} from "payload";

import {
  adminOnly,
  isAdminRequest,
  isSignedInAdmin,
  nobody,
} from "@/collections/utils/access";
import { userEndpoints } from "@/collections/utils/endpoints";
import { clock } from "@/lib/clock";
import { NAV_GROUPS } from "@/collections/utils/nav-groups";

/** Admins see everyone; an admin who must still change the temporary password sees only themself ("me"). */
const readUsers: Access = ({ req }): boolean | Where => {
  if (isAdminRequest(req)) return true;
  return req.user?.collection === "users"
    ? { id: { equals: req.user.id } }
    : false;
};

/** An expired temporary password cannot be used to sign in, even if it is correct. */
const rejectExpiredTemporaryPassword: CollectionBeforeLoginHook = ({
  user,
}) => {
  const expiresAt =
    typeof user.temporaryPasswordExpiresAt === "string"
      ? user.temporaryPasswordExpiresAt
      : null;
  if (
    user.mustChangePassword === true &&
    expiresAt &&
    expiresAt <= clock.nowIso()
  ) {
    throw new APIError(
      "Az ideiglenes jelszó lejárt. Kérjen új ideiglenes jelszót egy adminisztrátortól.",
      401
    );
  }
  return user;
};

/**
 * Admin accounts on Payload's native authentication (password hashing, sessions, lockout).
 * New admins are invited through the "Új admin meghívása" form (temporary password emailed, mandatory
 * change at first login); direct creation through the API is closed. The first user is still created
 * by Payload's own first-registration flow.
 */
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "Felhasználó", plural: "Felhasználók" },
  admin: {
    useAsTitle: "email",
    group: NAV_GROUPS.SYSTEM,
    defaultColumns: [
      "email",
      "mustChangePassword",
      "temporaryPasswordExpiresAt",
      "createdAt",
    ],
    components: {
      beforeListTable: ["@/components/admin/InviteAdminForm#InviteAdminForm"],
    },
  },
  auth: { maxLoginAttempts: 5, lockTime: 15 * 60 * 1000, useSessions: true },
  access: {
    // Signed-in admins may open the admin shell, including those who must first change their password;
    // every data operation is still refused for them (see isAdminRequest).
    admin: ({ req }) => isSignedInAdmin(req),
    read: readUsers,
    create: () => false,
    update: adminOnly,
    delete: adminOnly,
  },
  endpoints: userEndpoints,
  fields: [
    {
      name: "roles",
      label: "Szerepkörök",
      type: "select",
      hasMany: true,
      required: true,
      defaultValue: ["admin"],
      saveToJWT: true,
      options: [{ label: "Adminisztrátor", value: "admin" }],
    },
    {
      name: "accountActions",
      type: "ui",
      admin: {
        components: {
          Field: "@/components/admin/AdminAccountActions#AdminAccountActions",
        },
      },
    },
    {
      name: "mustChangePassword",
      label: "Jelszócsere szükséges (ideiglenes jelszó)",
      type: "checkbox",
      defaultValue: false,
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "temporaryPasswordExpiresAt",
      label: "Ideiglenes jelszó lejárata",
      type: "date",
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    // Keyed hash of the temporary password, only to reject its reuse. Never readable through any API.
    {
      name: "temporaryPasswordFingerprint",
      type: "text",
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
    },
    {
      name: "lastInvitationEmail",
      label: "Utolsó meghívó e-mail",
      type: "relationship",
      relationTo: "email-messages",
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, position: "sidebar" },
    },
  ],
  hooks: { beforeLogin: [rejectExpiredTemporaryPassword] },
};
