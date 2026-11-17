import type { FieldAccess, GlobalConfig } from "payload";

import { adminOnly } from "@/collections/utils/access";
import { NAV_GROUPS } from "@/collections/utils/nav-groups";
import { validateSender } from "@/lib/email-address";

/** Email addresses are server-side configuration: never exposed by the public settings read. */
const signedIn: FieldAccess = ({ req }) => Boolean(req.user);

/** Store-wide settings (contact, collection point, delivery methods and fees, legal versions, SEO, homepage, info pages). */
export const StoreSettings: GlobalConfig = {
  slug: "store-settings",
  label: "Áruház beállításai",
  admin: { group: NAV_GROUPS.SETTINGS },
  access: { read: () => true, update: adminOnly },
  fields: [
    { name: "storeName", label: "Áruház neve", type: "text", required: true },
    {
      type: "collapsible",
      label: "E-mail küldés",
      fields: [
        {
          // Not "contactEmail": that column (contact_email) belongs to the public Kapcsolat → E-mail field.
          name: "storeContactEmail",
          label: "Kapcsolati e-mail (bolti értesítések címzettje)",
          type: "email",
          access: { read: signedIn },
          admin: {
            description:
              "Ide érkeznek a kapcsolati űrlap üzenetei és az új rendelések bolti értesítései. A látogató címe csak válaszcím (Reply-To) lesz, sosem feladó.",
          },
        },
        {
          name: "emailFrom",
          label: "Feladó (From)",
          type: "text",
          access: { read: signedIn },
          validate: validateSender,
          admin: {
            placeholder: "Webshop <rendeles@example.hu>",
            description:
              "Formátum: „Webshop <rendeles@example.hu>” vagy „rendeles@example.hu”. A domainnek ellenőrzöttnek kell lennie a Resendben (Domains); a mező módosítása nem kerüli meg a szolgáltató korlátozásait (pl. a tesztkorlátozást). Éles küldéshez (EMAIL_MODE=resend) kötelező. A módosítás azonnal érvényes, újratelepítés nélkül.",
          },
        },
      ],
    },
    // Former recipient fields, replaced by contactEmail; kept (hidden, unused) so the migration is non-destructive.
    {
      name: "storeNotificationEmail",
      label: "Bolti értesítési e-mail (régi)",
      type: "email",
      access: { read: signedIn },
      admin: { hidden: true },
    },
    {
      name: "contactRecipientEmail",
      label: "Kapcsolati űrlap címzettje (régi)",
      type: "email",
      access: { read: signedIn },
      admin: { hidden: true },
    },
    {
      name: "contact",
      label: "Kapcsolat",
      type: "group",
      fields: [
        { name: "email", label: "E-mail", type: "email" },
        { name: "phone", label: "Telefon", type: "text" },
        { name: "address", label: "Cím", type: "text" },
      ],
    },
    {
      name: "collection",
      label: "Személyes átvétel",
      type: "group",
      fields: [
        { name: "address", label: "Átvételi cím", type: "text" },
        {
          name: "openingHours",
          label: "Nyitvatartás",
          type: "array",
          fields: [
            { name: "line", label: "Sor", type: "text", required: true },
          ],
        },
        { name: "note", label: "Megjegyzés", type: "textarea" },
      ],
    },
    {
      name: "deliveryMethods",
      label: "Szállítási módok",
      type: "array",
      fields: [
        { name: "methodId", label: "Azonosító", type: "text", required: true },
        {
          name: "kind",
          label: "Típus",
          type: "select",
          required: true,
          options: [
            { label: "Személyes átvétel", value: "collection" },
            { label: "Kiszállítás", value: "delivery" },
          ],
        },
        { name: "name", label: "Név", type: "text", required: true },
        { name: "description", label: "Leírás", type: "textarea" },
        {
          name: "enabled",
          label: "Elérhető",
          type: "checkbox",
          defaultValue: true,
        },
        {
          name: "feeKind",
          label: "Díj típusa",
          type: "select",
          required: true,
          defaultValue: "free",
          options: [
            { label: "Ingyenes", value: "free" },
            { label: "Fix díj", value: "fixed" },
          ],
        },
        {
          name: "feeAmount",
          label: "Díj (Ft)",
          type: "number",
          min: 0,
          admin: {
            condition: (_data, sibling) => sibling?.feeKind === "fixed",
          },
          validate: (
            value: number | null | undefined,
            { siblingData }: { siblingData: Record<string, unknown> }
          ) =>
            siblingData.feeKind !== "fixed" ||
            (typeof value === "number" &&
              Number.isSafeInteger(value) &&
              value >= 0)
              ? true
              : "Fix díjhoz egész forintösszeg szükséges.",
        },
      ],
    },
    {
      name: "legal",
      label: "Jogi dokumentumok verziói",
      type: "group",
      fields: [
        {
          name: "termsVersion",
          label: "ÁSZF verzió",
          type: "text",
          required: true,
        },
        {
          name: "privacyVersion",
          label: "Adatkezelési tájékoztató verzió",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "seo",
      label: "SEO alapértékek",
      type: "group",
      fields: [
        { name: "defaultTitle", label: "Alapértelmezett cím", type: "text" },
        {
          name: "defaultDescription",
          label: "Alapértelmezett leírás",
          type: "textarea",
        },
      ],
    },
    {
      name: "homepage",
      label: "Főoldal",
      type: "group",
      fields: [
        { name: "heroTitle", label: "Fő cím", type: "text" },
        { name: "heroText", label: "Bevezető szöveg", type: "textarea" },
        {
          name: "featuredHeading",
          label: "Kiemelt termékek címe",
          type: "text",
        },
        {
          name: "highlights",
          label: "Előnyök",
          type: "array",
          fields: [
            { name: "title", label: "Cím", type: "text" },
            { name: "text", label: "Szöveg", type: "textarea" },
          ],
        },
      ],
    },
    {
      name: "pages",
      label:
        "Tájékoztató oldalak (ÁSZF, adatvédelem, garancia; a GYIK és a fizetés/szállítás külön oldal)",
      type: "array",
      fields: [
        { name: "slug", label: "URL-azonosító", type: "text", required: true },
        { name: "title", label: "Cím", type: "text", required: true },
        {
          name: "body",
          label: "Tartalom (bekezdések üres sorral elválasztva)",
          type: "textarea",
          required: true,
        },
      ],
    },
  ],
};
