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

/** Áruház beállítások: store identity and contact, limits, legal pages. */
export type StoreSettings = {
  storeName: string;
  contact: { email: string; phone: string; address: string };
  legal: { termsVersion: string; privacyVersion: string };
  limits: BusinessLimits;
  pages: InfoPage[];
};

/** Személyes átvétel: the collection point (checkout, /fizetes-es-szallitas, "ready for collection" email). */
export type CollectionPoint = { address: string; openingHours: string[]; note: string };

/** Fizetési és szállítási beállítások. */
export type PaymentSettings = {
  paymentPage: PaymentPageContent;
  deliveryMethods: DeliveryMethod[];
  collection: CollectionPoint;
};

/** Email beállítások (server-only, never rendered). */
export type EmailSettings = {
  /** Recipient of contact-form messages and store notifications (null until configured). */
  contactEmail: string | null;
  /** Sender, e.g. "Webshop <rendeles@example.hu>" (null until configured). */
  emailFrom: string | null;
};

/** Főoldal beállítások. */
export type HomepageSettings = {
  heroTitle: string;
  heroText: string;
  /** Labels of the two hero buttons (destinations are fixed: /termekek and /gyik). */
  heroPrimaryLabel: string;
  heroSecondaryLabel: string;
  featured: FeaturedLayout;
  highlights: { title: string; text: string }[];
};

/** Homepage featured products: up to `count` products in a desktop grid of `columns`; rows × columns is the capacity. */
export type FeaturedLayout = { heading: string; count: number; columns: number; rows: number };

/** Visible content of /fizetes-es-szallitas. Delivery methods, fees and the collection point come from the settings. */
export type PaymentPageContent = {
  title: string;
  intro: string;
  paymentHeading: string;
  paymentItems: string[];
  methodsHeading: string;
  collectionHeading: string;
  openingHoursHeading: string;
  processHeading: string;
  processSteps: string[];
};

/** Business limits from Áruház beállítások → Üzleti szabályok (bounded by TECHNICAL_LIMITS in config/shop.ts). */
export type BusinessLimits = {
  maxLineQuantity: number;
  maxCartLines: number;
  /** Price-change response period after the proposal email is sent (hours); snapshotted on each proposal. */
  priceChangeResponseHours: number;
  /** Response period after the reminder email is sent (hours); snapshotted on each proposal. */
  priceChangeReminderHours: number;
};

/** The quantity limits the browser cart enforces (the server checks them again). */
export type CartLimits = Pick<BusinessLimits, 'maxLineQuantity' | 'maxCartLines'>;

/** A branding image (logo or favicon) from Fejléc beállítások. */
export type BrandingImage = { url: string; alt: string; mimeType: string; width: number | null; height: number | null };

/** Header and footer chrome: Áruház beállítások → Fejléc (logo, favicon) and → Lábléc (slogan). */
export type SiteChrome = { logo: BrandingImage | null; favicon: BrandingImage | null; footerSlogan: string };

export type FaqEntry = { id: string; question: string; answer: string };
