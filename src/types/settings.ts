import type { HufAmount } from "@/types/common";

/** free = 0 Ft; fixed = the configured whole-forint amount. */
export type DeliveryFee =
  { kind: "free" } | { kind: "fixed"; amount: HufAmount };

export type DeliveryMethodKind = "collection" | "delivery";

export type DeliveryMethod = {
  id: string;
  kind: DeliveryMethodKind;
  name: string;
  description: string;
  enabled: boolean;
  fee: DeliveryFee;
};

export type InfoPage = {
  slug: string;
  title: string;
  paragraphs: string[];
};

export type StoreSettings = {
  storeName: string;
  contact: { email: string; phone: string; address: string };
  /** Server-only recipient of contact-form messages and store notifications (null until configured). */
  contactEmail: string | null;
  /** Server-only sender, e.g. "Webshop <rendeles@example.hu>" (null until configured). */
  emailFrom: string | null;
  collection: { address: string; openingHours: string[]; note: string };
  deliveryMethods: DeliveryMethod[];
  legal: { termsVersion: string; privacyVersion: string };
  seo: { defaultTitle: string; defaultDescription: string };
  homepage: {
    heroTitle: string;
    heroText: string;
    featuredHeading: string;
    highlights: { title: string; text: string }[];
  };
  pages: InfoPage[];
};
