import type { Field, GlobalConfig, UploadField, Validate } from "payload";

import {
  FAVICON_MIME_TYPES,
  LOGO_MIME_TYPES,
} from "@/collections/BrandingAssets";
import { adminOnly } from "@/collections/utils/access";
import { boundedIntField } from "@/collections/utils/fields";
import { NAV_GROUPS } from "@/collections/utils/nav-groups";
import { TECHNICAL_LIMITS } from "@/config/shop";

/** Server-side format check of the chosen branding file (the picker filter alone can be bypassed through the API). */
function allowedFormats(allowed: readonly string[], what: string): Validate {
  return async (value, { req }) => {
    if (value === null || value === undefined || value === "") return true;
    const id =
      typeof value === "object" && value !== null && "id" in value
        ? (value as { id: number }).id
        : value;
    const asset = await req.payload
      .findByID({
        collection: "branding-assets",
        id: id as number,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null);
    if (!asset) return "A kiválasztott fájl nem található.";
    return asset.mimeType && allowed.includes(asset.mimeType)
      ? true
      : `${what}: nem támogatott formátum (${asset.mimeType ?? "ismeretlen"}).`;
  };
}

/** Logo/favicon field: Payload's own "upload new" and "choose existing" controls on the branding collection. */
function brandingUpload(
  name: string,
  label: string,
  allowed: readonly string[],
  description: string
): UploadField {
  return {
    name,
    label,
    type: "upload",
    relationTo: "branding-assets",
    filterOptions: { mimeType: { in: [...allowed] } },
    validate: allowedFormats(allowed, label),
    admin: { description },
  };
}

/**
 * Áruház tab, in display order: name, slogan, logo, favicon, contact. Plain top-level fields without wrappers, so
 * every field keeps its stored name and database column.
 */
const storeTab: Field[] = [
  {
    name: "storeName",
    label: "Webshop neve",
    type: "text",
    required: true,
    admin: {
      description:
        "A fejlécben (ha nincs logó), a láblécben, az e-mailekben és a böngészőfül címében jelenik meg.",
    },
  },
  {
    name: "footerSlogan",
    label: "Szlogen",
    type: "textarea",
    defaultValue:
      "Előrendelés online, fizetés személyes átvételkor vagy kiszállításkor. Online fizetés nincs.",
    admin: {
      description:
        "A láblécben, a webshop neve alatt jelenik meg. Üresen nem jelenik meg semmi.",
    },
  },
  brandingUpload(
    "logo",
    "Logó",
    LOGO_MIME_TYPES,
    "PNG, WebP, JPEG, AVIF vagy SVG, sötét háttérhez. A fejlécben és a láblécben jelenik meg az arányai megtartásával; ha üres, a webshop neve látszik szövegként."
  ),
  brandingUpload(
    "favicon",
    "Favicon",
    FAVICON_MIME_TYPES,
    "PNG (legalább 32 × 32 px, négyzetes), SVG vagy ICO. Ha üres, a böngésző alapértelmezett ikonja látszik."
  ),
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
];

const faqTab: Field[] = [
  {
    // No data here: the entries are records of the (sidebar-hidden) faqs collection, the single source of /gyik.
    name: "faqManager",
    type: "ui",
    admin: {
      components: { Field: "@/components/admin/FaqManager#FaqManager" },
    },
  },
];

/** Equal columns in the business-rule rows (Payload row layout; rows stack on narrow screens). */
const HALF: string = "50%";

const rulesTab: Field[] = [
  {
    name: "limits",
    label: "Üzleti szabályok",
    type: "group",
    admin: {
      description:
        "A kosár, a pénztár és a rendelésleadás is ezeket ellenőrzi. Változtatáskor a már leadott rendelések nem módosulnak; a már elküldött árváltozási ajánlatok a saját, induláskor rögzített határidejükkel futnak tovább.",
    },
    fields: [
      {
        type: "row",
        fields: [
          boundedIntField(
            "maxLineQuantity",
            "Max. darab tételenként",
            5,
            1,
            TECHNICAL_LIMITS.maxLineQuantity,
            { width: HALF }
          ),
          boundedIntField(
            "maxCartLines",
            "Max. különböző tétel",
            20,
            1,
            TECHNICAL_LIMITS.maxCartLines,
            { width: HALF }
          ),
        ],
      },
      {
        type: "row",
        fields: [
          boundedIntField(
            "priceChangeResponseHours",
            "Árváltozás: első válaszidő (óra)",
            24,
            1,
            TECHNICAL_LIMITS.maxResponseHours,
            { width: HALF, description: "Az ajánlat sikeres elküldésétől számítva; utána emlékeztetőt küldünk." }
          ),
          boundedIntField(
            "priceChangeReminderHours",
            "Árváltozás: emlékeztető utáni válaszidő (óra)",
            24,
            1,
            TECHNICAL_LIMITS.maxResponseHours,
            { width: HALF, description: "Az emlékeztető sikeres elküldésétől számítva; utána a rendelés törlődik." }
          ),
        ],
      },
    ],
  },
];

const legalTab: Field[] = [
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
];

/**
 * Áruház beállítások: store identity and contact with the header (logo, favicon) and footer (slogan) sections, the FAQ entries, business rules and legal pages. The tabs are unnamed, so they only organize the
 * form: every field keeps its top-level name and database column. Email and homepage settings are separate globals.
 */
export const StoreSettings: GlobalConfig = {
  slug: "store-settings",
  label: "Áruház beállítások",
  admin: { group: NAV_GROUPS.SETTINGS },
  access: { read: () => true, update: adminOnly },
  fields: [
    {
      type: "tabs",
      tabs: [
        { label: "Áruház", fields: storeTab },
        { label: "Üzleti szabályok", fields: rulesTab },
        { label: "Jogi és tájékoztató oldalak", fields: legalTab },
        { label: "GYIK", fields: faqTab },
      ],
    },
  ],
};
