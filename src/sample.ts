import "server-only";

import { normalizeHexColor } from "@/lib/hex";
import { buildMediaObjectKey } from "@/lib/storage-path";
import type {
  Brand,
  Category,
  Orderability,
  Product,
  ProductImage,
  ProductVariant,
  SpecificationGroup,
} from "@/types/catalog";
import type { Order } from "@/types/order";
import type { PriceChangeProposal } from "@/types/proposal";
import type { StoreSettings } from "@/types/settings";

/**
 * Immutable initial sample data. Only `src/dto/` may import this module.
 * All business details, customers, fees and texts are fictional. Product names refer to
 * real device families for realism; prices and specifications are illustrative only.
 */

export type SampleData = {
  brands: Brand[];
  categories: Category[];
  products: Product[];
  orders: Order[];
  proposals: PriceChangeProposal[];
  settings: StoreSettings;
};

const BASE_DATE: number = Date.UTC(2026, 9, 1, 8, 0, 0);

function daysAfterBase(days: number): string {
  return new Date(BASE_DATE + days * 24 * 60 * 60 * 1000).toISOString();
}

const brands: Brand[] = [
  {
    id: "brand-apple",
    slug: "apple",
    name: "Apple",
    description: "iPhone, iPad, Apple Watch és AirPods előrendelésre.",
    sortOrder: 1,
    popularityRank: 1,
  },
  {
    id: "brand-samsung",
    slug: "samsung",
    name: "Samsung",
    description:
      "Galaxy telefonok, tabletek, okosórák és fülhallgatók előrendelésre.",
    sortOrder: 2,
    popularityRank: 2,
  },
  {
    id: "brand-xiaomi",
    slug: "xiaomi",
    name: "Xiaomi",
    description: "Xiaomi telefonok és tabletek előrendelésre.",
    sortOrder: 3,
    popularityRank: 3,
  },
  {
    id: "brand-google",
    slug: "google",
    name: "Google",
    description: "Pixel telefonok és okosórák előrendelésre.",
    sortOrder: 4,
    popularityRank: 4,
  },
];

const categories: Category[] = [
  {
    id: "cat-mobiltelefon",
    slug: "mobiltelefon",
    name: "Mobiltelefonok",
    description: "Okostelefonok több tárhely- és színváltozatban.",
    sortOrder: 1,
    popularityRank: 1,
  },
  {
    id: "cat-tablet",
    slug: "tablet",
    name: "Tabletek",
    description: "Tabletek munkára, tanulásra és szórakozásra.",
    sortOrder: 2,
    popularityRank: 3,
  },
  {
    id: "cat-okosora",
    slug: "okosora",
    name: "Okosórák",
    description: "Okosórák sporthoz és mindennapi használatra.",
    sortOrder: 3,
    popularityRank: 2,
  },
  {
    id: "cat-fulhallgato",
    slug: "fulhallgato",
    name: "Fülhallgatók",
    description: "Vezeték nélküli fülhallgatók zajszűréssel.",
    sortOrder: 4,
    popularityRank: 4,
  },
];

type ProductSeed = {
  id: string;
  slug: string;
  name: string;
  model: string;
  brand: "apple" | "samsung" | "xiaomi" | "google";
  category: "mobiltelefon" | "tablet" | "okosora" | "fulhallgato";
  skuPrefix: string;
  description: string;
  featured?: boolean;
  status?: "draft" | "published";
  orderability?: Orderability;
  procurement: [number, number];
  colors: [string, string | null][];
  /** Either storage options (GB) or case sizes (mm); prices align by index. */
  options:
    | { kind: "storage"; values: number[]; ram?: number[] }
    | { kind: "size"; values: number[] }
    | { kind: "none"; values: [0] };
  prices: number[];
  unavailableSkus?: string[];
  specs: SpecificationGroup[];
  createdDay: number;
};

function optionCode(kind: "storage" | "size" | "none", value: number): string {
  if (kind === "none") return "STD";
  if (kind === "size") return `${value}MM`;
  return value >= 1024 ? `${value / 1024}TB` : `${value}`;
}

function buildProduct(seed: ProductSeed): Product {
  const images: ProductImage[] = seed.colors.map(
    ([rawHex, label], index: number) => {
      const hex = normalizeHexColor(rawHex);
      if (!hex) throw new Error(`Érvénytelen minta HEX: ${rawHex}`);
      const objectKey = buildMediaObjectKey({
        brandSlug: seed.brand,
        categorySlug: seed.category,
        productSlug: seed.slug,
        colorHex: hex,
        fileName: "elolnezet.svg",
        uniqueSuffix: null,
      });
      return {
        id: `${seed.id}-img-${index + 1}`,
        objectKey,
        url: `/sample-media/${objectKey}`,
        alt: `${seed.name} – ${label ?? hex} (mintakép)`,
        colorHex: hex,
      };
    }
  );

  const variants: ProductVariant[] = [];
  seed.colors.forEach(([rawHex, label], colorIndex: number) => {
    const hex = normalizeHexColor(rawHex);
    seed.options.values.forEach((value: number, optionIndex: number) => {
      const price = seed.prices[optionIndex];
      const image = images[colorIndex];
      if (price === undefined || !image)
        throw new Error(`Hiányzó minta ár: ${seed.slug}`);
      const sku = `${seed.skuPrefix}-${optionCode(seed.options.kind, value)}-${String(colorIndex + 1).padStart(2, "0")}`;
      const ram =
        seed.options.kind === "storage"
          ? (seed.options.ram?.[optionIndex] ?? null)
          : null;
      variants.push({
        sku,
        attributes: {
          colorHex: hex,
          colorLabel: label,
          storageGb: seed.options.kind === "storage" ? value : null,
          ramGb: ram,
          caseSizeMm: seed.options.kind === "size" ? value : null,
        },
        price,
        orderability: seed.unavailableSkus?.includes(sku)
          ? "temporarily_unavailable"
          : "preorderable",
        procurementEstimate: null,
        imageIds: [image.id],
      });
    });
  });

  return {
    id: seed.id,
    slug: seed.slug,
    name: seed.name,
    model: seed.model,
    brandId: `brand-${seed.brand}`,
    categoryIds: [`cat-${seed.category}`],
    description: seed.description,
    specifications: seed.specs,
    images,
    variants,
    status: seed.status ?? "published",
    featured: seed.featured ?? false,
    orderability: seed.orderability ?? "preorderable",
    procurementEstimate: {
      minDays: seed.procurement[0],
      maxDays: seed.procurement[1],
    },
    seo: { title: null, description: null },
    createdAt: daysAfterBase(seed.createdDay),
    updatedAt: daysAfterBase(seed.createdDay),
  };
}

function phoneSpecs(
  display: string,
  chip: string,
  camera: string,
  battery: string
): SpecificationGroup[] {
  return [
    { title: "Kijelző", items: [{ label: "Képátló", value: display }] },
    { title: "Teljesítmény", items: [{ label: "Processzor", value: chip }] },
    { title: "Kamera", items: [{ label: "Hátlapi kamera", value: camera }] },
    { title: "Akkumulátor", items: [{ label: "Jellemző", value: battery }] },
    {
      title: "Megjegyzés",
      items: [
        {
          label: "Adatok",
          value:
            "Mintaadat – a végleges specifikációt a gyártói adatlap tartalmazza.",
        },
      ],
    },
  ];
}

function watchSpecs(display: string, feature: string): SpecificationGroup[] {
  return [
    { title: "Kijelző", items: [{ label: "Típus", value: display }] },
    { title: "Funkciók", items: [{ label: "Kiemelt", value: feature }] },
    {
      title: "Megjegyzés",
      items: [
        {
          label: "Adatok",
          value:
            "Mintaadat – a végleges specifikációt a gyártói adatlap tartalmazza.",
        },
      ],
    },
  ];
}

const productSeeds: ProductSeed[] = [
  {
    id: "prod-iphone-17",
    slug: "iphone-17",
    name: "Apple iPhone 17",
    model: "iPhone 17",
    brand: "apple",
    category: "mobiltelefon",
    skuPrefix: "APL-IP17",
    description:
      "Kiegyensúlyozott iPhone mindennapi használatra, több színben és tárhelyméretben. Minta termékleírás.",
    featured: true,
    procurement: [5, 10],
    createdDay: 0,
    colors: [
      ["#1C1C1E", "Fekete"],
      ["#F5F5F0", "Fehér"],
      ["#C9B8E8", "Levendula"],
      ["#A8B89A", null],
    ],
    options: { kind: "storage", values: [256, 512] },
    prices: [449990, 549990],
    specs: phoneSpecs(
      '6,3"',
      "Apple A-sorozatú chip",
      "Kettős kamerarendszer",
      "Egész napos üzemidő (minta)"
    ),
  },
  {
    id: "prod-iphone-17-pro",
    slug: "iphone-17-pro",
    name: "Apple iPhone 17 Pro",
    model: "iPhone 17 Pro",
    brand: "apple",
    category: "mobiltelefon",
    skuPrefix: "APL-IP17P",
    description:
      "Prémium iPhone fejlett kamerarendszerrel és nagy tárhelyopciókkal. Minta termékleírás.",
    featured: true,
    procurement: [7, 14],
    createdDay: 1,
    colors: [
      ["#F2F2F0", "Ezüst"],
      ["#E8742A", "Narancs"],
      ["#2B3A55", "Mélykék"],
    ],
    options: { kind: "storage", values: [256, 512, 1024] },
    prices: [579990, 679990, 839990],
    unavailableSkus: ["APL-IP17P-1TB-02"],
    specs: phoneSpecs(
      '6,3"',
      "Apple Pro chip",
      "Hármas kamerarendszer",
      "Gyorstöltés (minta)"
    ),
  },
  {
    id: "prod-iphone-17-pro-max",
    slug: "iphone-17-pro-max",
    name: "Apple iPhone 17 Pro Max",
    model: "iPhone 17 Pro Max",
    brand: "apple",
    category: "mobiltelefon",
    skuPrefix: "APL-IP17PM",
    description:
      "A legnagyobb kijelzős Pro iPhone hosszú üzemidővel. Minta termékleírás.",
    procurement: [7, 14],
    createdDay: 2,
    colors: [
      ["#F2F2F0", "Ezüst"],
      ["#E8742A", "Narancs"],
      ["#2B3A55", "Mélykék"],
    ],
    options: { kind: "storage", values: [256, 512, 1024, 2048] },
    prices: [649990, 749990, 909990, 1069990],
    specs: phoneSpecs(
      '6,9"',
      "Apple Pro chip",
      "Hármas kamerarendszer",
      "Kiemelkedő üzemidő (minta)"
    ),
  },
  {
    id: "prod-iphone-air",
    slug: "iphone-air",
    name: "Apple iPhone Air",
    model: "iPhone Air",
    brand: "apple",
    category: "mobiltelefon",
    skuPrefix: "APL-IPAIR",
    description: "Különösen vékony és könnyű iPhone. Minta termékleírás.",
    procurement: [5, 12],
    createdDay: 3,
    colors: [
      ["#E3E4E0", "Felhőfehér"],
      ["#F3E9D2", "Arany"],
      ["#C5D6E8", "Égkék"],
      ["#1D1D1F", "Asztrofekete"],
    ],
    options: { kind: "storage", values: [256, 512, 1024] },
    prices: [529990, 629990, 789990],
    specs: phoneSpecs(
      '6,5"',
      "Apple A-sorozatú Pro chip",
      "Egyetlen nagy felbontású kamera",
      "Vékony kialakítás (minta)"
    ),
  },
  {
    id: "prod-iphone-16e",
    slug: "iphone-16e",
    name: "Apple iPhone 16e",
    model: "iPhone 16e",
    brand: "apple",
    category: "mobiltelefon",
    skuPrefix: "APL-IP16E",
    description: "Belépő szintű iPhone kedvezőbb áron. Minta termékleírás.",
    procurement: [3, 7],
    createdDay: 4,
    colors: [
      ["#000000", "Fekete"],
      ["#FFFFFF", "Fehér"],
    ],
    options: { kind: "storage", values: [128, 256] },
    prices: [279990, 329990],
    specs: phoneSpecs(
      '6,1"',
      "Apple A-sorozatú chip",
      "Egyetlen kamera",
      "Egész napos üzemidő (minta)"
    ),
  },
  {
    id: "prod-iphone-15",
    slug: "iphone-15",
    name: "Apple iPhone 15",
    model: "iPhone 15",
    brand: "apple",
    category: "mobiltelefon",
    skuPrefix: "APL-IP15",
    description:
      "Korábbi generációs iPhone – már nem rendelhető. Minta termékleírás.",
    orderability: "discontinued",
    procurement: [0, 0],
    createdDay: 5,
    colors: [
      ["#1F2020", "Fekete"],
      ["#E9F1E3", null],
    ],
    options: { kind: "storage", values: [128] },
    prices: [249990],
    specs: phoneSpecs(
      '6,1"',
      "Apple A-sorozatú chip",
      "Kettős kamera",
      "Minta"
    ),
  },
  {
    id: "prod-ipad-air-13",
    slug: "ipad-air-13",
    name: 'Apple iPad Air 13"',
    model: "iPad Air 13",
    brand: "apple",
    category: "tablet",
    skuPrefix: "APL-IPADA13",
    description:
      "Nagy kijelzős, könnyű tablet tanuláshoz és alkotáshoz. Minta termékleírás.",
    featured: true,
    procurement: [7, 14],
    createdDay: 6,
    colors: [
      ["#8A8D91", "Asztroszürke"],
      ["#E3E1F0", "Lila"],
      ["#D4E3F0", "Kék"],
    ],
    options: { kind: "storage", values: [128, 256, 512] },
    prices: [339990, 389990, 489990],
    specs: phoneSpecs(
      '13"',
      "Apple M-sorozatú chip",
      "Széles látószögű kamera",
      "Egész napos üzemidő (minta)"
    ),
  },
  {
    id: "prod-ipad-pro-11",
    slug: "ipad-pro-11",
    name: 'Apple iPad Pro 11"',
    model: "iPad Pro 11",
    brand: "apple",
    category: "tablet",
    skuPrefix: "APL-IPADP11",
    description:
      "Professzionális tablet nagy teljesítménnyel. Minta termékleírás.",
    procurement: [10, 20],
    createdDay: 7,
    colors: [
      ["#2E2E30", "Asztrofekete"],
      ["#E3E4E5", "Ezüst"],
    ],
    options: { kind: "storage", values: [256, 512, 1024], ram: [12, 12, 16] },
    prices: [449990, 549990, 709990],
    specs: phoneSpecs(
      '11"',
      "Apple M-sorozatú chip",
      "Pro kamerarendszer",
      "Egész napos üzemidő (minta)"
    ),
  },
  {
    id: "prod-ipad-mini",
    slug: "ipad-mini",
    name: "Apple iPad mini",
    model: "iPad mini",
    brand: "apple",
    category: "tablet",
    skuPrefix: "APL-IPADMINI",
    description:
      "Kompakt tablet, amely egy kézben is kényelmes. Minta termékleírás.",
    procurement: [5, 10],
    createdDay: 8,
    colors: [
      ["#E3E4E5", "Csillagfény"],
      ["#8E8E93", "Asztroszürke"],
      ["#D6CDE6", null],
    ],
    options: { kind: "storage", values: [128, 256] },
    prices: [219990, 259990],
    unavailableSkus: ["APL-IPADMINI-256-03"],
    specs: phoneSpecs(
      '8,3"',
      "Apple A-sorozatú Pro chip",
      "Széles látószögű kamera",
      "Egész napos üzemidő (minta)"
    ),
  },
  {
    id: "prod-apple-watch-series-11",
    slug: "apple-watch-series-11",
    name: "Apple Watch Series 11",
    model: "Watch Series 11",
    brand: "apple",
    category: "okosora",
    skuPrefix: "APL-AWS11",
    description:
      "Egészség- és edzéskövető okosóra két tokméretben. Minta termékleírás.",
    featured: true,
    procurement: [5, 10],
    createdDay: 9,
    colors: [
      ["#1D1D1F", "Éjfekete"],
      ["#F0E4D6", "Rozéarany"],
      ["#E5E5E7", "Ezüst"],
    ],
    options: { kind: "size", values: [42, 46] },
    prices: [169990, 184990],
    specs: watchSpecs("Mindig aktív kijelző", "Egészségügyi érzékelők (minta)"),
  },
  {
    id: "prod-apple-watch-ultra-3",
    slug: "apple-watch-ultra-3",
    name: "Apple Watch Ultra 3",
    model: "Watch Ultra 3",
    brand: "apple",
    category: "okosora",
    skuPrefix: "APL-AWU3",
    description: "Strapabíró okosóra outdoor sportokhoz. Minta termékleírás.",
    procurement: [10, 20],
    createdDay: 10,
    colors: [
      ["#1D1D1F", "Fekete titán"],
      ["#D9CDB8", "Natúr titán"],
    ],
    options: { kind: "size", values: [49] },
    prices: [349990],
    specs: watchSpecs(
      "Nagy fényerejű kijelző",
      "Kettős frekvenciás GPS (minta)"
    ),
  },
  {
    id: "prod-apple-watch-se-3",
    slug: "apple-watch-se-3",
    name: "Apple Watch SE 3",
    model: "Watch SE 3",
    brand: "apple",
    category: "okosora",
    skuPrefix: "APL-AWSE3",
    description:
      "Kedvező árú okosóra az alapvető funkciókkal. Minta termékleírás.",
    procurement: [3, 7],
    createdDay: 11,
    colors: [
      ["#E3E1DC", "Csillagfény"],
      ["#2C2C2E", "Éjfél"],
    ],
    options: { kind: "size", values: [40, 44] },
    prices: [109990, 124990],
    specs: watchSpecs("Retina kijelző", "Aktivitáskövetés (minta)"),
  },
  {
    id: "prod-galaxy-s26",
    slug: "galaxy-s26",
    name: "Samsung Galaxy S26",
    model: "Galaxy S26",
    brand: "samsung",
    category: "mobiltelefon",
    skuPrefix: "SAM-S26",
    description: "Kompakt csúcskategóriás Galaxy telefon. Minta termékleírás.",
    featured: true,
    procurement: [5, 10],
    createdDay: 12,
    colors: [
      ["#1C2A44", "Sötétkék"],
      ["#E8E8E8", "Ezüst"],
      ["#C4D8C9", "Menta"],
      ["#4A4A4F", null],
    ],
    options: { kind: "storage", values: [256, 512], ram: [12, 12] },
    prices: [399990, 459990],
    specs: phoneSpecs(
      '6,2"',
      "Snapdragon / Exynos (piactól függ)",
      "Hármas kamerarendszer",
      "Gyorstöltés (minta)"
    ),
  },
  {
    id: "prod-galaxy-s26-ultra",
    slug: "galaxy-s26-ultra",
    name: "Samsung Galaxy S26 Ultra",
    model: "Galaxy S26 Ultra",
    brand: "samsung",
    category: "mobiltelefon",
    skuPrefix: "SAM-S26U",
    description:
      "A Galaxy S sorozat csúcsmodellje beépített tollal. Minta termékleírás.",
    featured: true,
    procurement: [7, 14],
    createdDay: 13,
    colors: [
      ["#2D2D2F", "Titánfekete"],
      ["#B8C6D4", "Titánkék"],
      ["#D9C8E8", "Titánlila"],
      ["#F0F0EE", "Titánezüst"],
    ],
    options: { kind: "storage", values: [256, 512, 1024], ram: [12, 12, 16] },
    prices: [569990, 639990, 779990],
    specs: phoneSpecs(
      '6,9"',
      "Snapdragon for Galaxy",
      "Négyes kamerarendszer",
      "Nagy kapacitású akkumulátor (minta)"
    ),
  },
  {
    id: "prod-galaxy-z-fold7",
    slug: "galaxy-z-fold7",
    name: "Samsung Galaxy Z Fold7",
    model: "Galaxy Z Fold7",
    brand: "samsung",
    category: "mobiltelefon",
    skuPrefix: "SAM-ZFOLD7",
    description: "Tabletté nyitható összehajtható telefon. Minta termékleírás.",
    procurement: [10, 20],
    createdDay: 14,
    colors: [
      ["#1E2A3A", "Kék árnyék"],
      ["#3A3A3C", "Grafit"],
      ["#D7D9DC", "Ezüst"],
    ],
    options: { kind: "storage", values: [256, 512], ram: [12, 12] },
    prices: [799990, 859990],
    specs: phoneSpecs(
      '8,0" belső kijelző',
      "Snapdragon for Galaxy",
      "Hármas kamerarendszer",
      "Minta"
    ),
  },
  {
    id: "prod-galaxy-z-flip7",
    slug: "galaxy-z-flip7",
    name: "Samsung Galaxy Z Flip7",
    model: "Galaxy Z Flip7",
    brand: "samsung",
    category: "mobiltelefon",
    skuPrefix: "SAM-ZFLIP7",
    description:
      "Kompakt, kagylóformájú összehajtható telefon. Minta termékleírás.",
    procurement: [7, 14],
    createdDay: 15,
    colors: [
      ["#1D2D50", "Éjkék"],
      ["#2B2B2B", "Fekete"],
      ["#F28C7A", "Korall"],
    ],
    options: { kind: "storage", values: [256, 512], ram: [12, 12] },
    prices: [459990, 519990],
    specs: phoneSpecs('6,9" belső kijelző', "Exynos", "Kettős kamera", "Minta"),
  },
  {
    id: "prod-galaxy-a57",
    slug: "galaxy-a57",
    name: "Samsung Galaxy A57",
    model: "Galaxy A57",
    brand: "samsung",
    category: "mobiltelefon",
    skuPrefix: "SAM-A57",
    description:
      "Megbízható középkategóriás telefon nagy akkumulátorral. Minta termékleírás.",
    procurement: [3, 7],
    createdDay: 16,
    colors: [
      ["#2B2D42", "Grafit"],
      ["#E6E6EA", "Fehér"],
      ["#B9D7EA", "Jégkék"],
      ["#F0D3E0", "Rózsaszín"],
    ],
    options: { kind: "storage", values: [128, 256], ram: [8, 8] },
    prices: [169990, 189990],
    specs: phoneSpecs(
      '6,7"',
      "Exynos",
      "Hármas kamera",
      "Két napos üzemidő (minta)"
    ),
  },
  {
    id: "prod-galaxy-s26-edge",
    slug: "galaxy-s26-edge",
    name: "Samsung Galaxy S26 Edge",
    model: "Galaxy S26 Edge",
    brand: "samsung",
    category: "mobiltelefon",
    skuPrefix: "SAM-S26E",
    description:
      "Piszkozat termék – nem jelenik meg a webshopban. Minta termékleírás.",
    status: "draft",
    procurement: [10, 20],
    createdDay: 17,
    colors: [["#9EA3A8", "Titánezüst"]],
    options: { kind: "storage", values: [256], ram: [12] },
    prices: [499990],
    specs: phoneSpecs(
      '6,7"',
      "Snapdragon for Galaxy",
      "Kettős kamera",
      "Minta"
    ),
  },
  {
    id: "prod-galaxy-tab-s11",
    slug: "galaxy-tab-s11",
    name: "Samsung Galaxy Tab S11",
    model: "Galaxy Tab S11",
    brand: "samsung",
    category: "tablet",
    skuPrefix: "SAM-TABS11",
    description: "Prémium Android tablet tollal. Minta termékleírás.",
    featured: true,
    procurement: [7, 14],
    createdDay: 18,
    colors: [
      ["#5A5A5E", "Grafit"],
      ["#D9D9DB", "Ezüst"],
    ],
    options: { kind: "storage", values: [128, 256, 512], ram: [12, 12, 12] },
    prices: [369990, 409990, 489990],
    specs: phoneSpecs(
      '11"',
      "MediaTek Dimensity",
      "Széles látószögű kamera",
      "Minta"
    ),
  },
  {
    id: "prod-galaxy-tab-s11-ultra",
    slug: "galaxy-tab-s11-ultra",
    name: "Samsung Galaxy Tab S11 Ultra",
    model: "Galaxy Tab S11 Ultra",
    brand: "samsung",
    category: "tablet",
    skuPrefix: "SAM-TABS11U",
    description: "Nagyméretű, prémium Android tablet. Minta termékleírás.",
    procurement: [10, 20],
    createdDay: 19,
    colors: [
      ["#5A5A5E", "Grafit"],
      ["#D9D9DB", "Ezüst"],
    ],
    options: { kind: "storage", values: [256, 512, 1024], ram: [12, 12, 16] },
    prices: [529990, 589990, 709990],
    specs: phoneSpecs('14,6"', "MediaTek Dimensity", "Kettős kamera", "Minta"),
  },
  {
    id: "prod-galaxy-tab-s10-fe",
    slug: "galaxy-tab-s10-fe",
    name: "Samsung Galaxy Tab S10 FE",
    model: "Galaxy Tab S10 FE",
    brand: "samsung",
    category: "tablet",
    skuPrefix: "SAM-TABS10FE",
    description:
      "Kedvező árú tablet tollal – jelenleg átmenetileg nem rendelhető. Minta termékleírás.",
    orderability: "temporarily_unavailable",
    procurement: [14, 28],
    createdDay: 20,
    colors: [
      ["#B9C9DB", "Kék"],
      ["#8A8C90", "Szürke"],
      ["#D9D3E9", null],
    ],
    options: { kind: "storage", values: [128, 256], ram: [8, 8] },
    prices: [189990, 219990],
    specs: phoneSpecs('10,9"', "Exynos", "Kamera", "Minta"),
  },
  {
    id: "prod-galaxy-watch8",
    slug: "galaxy-watch8",
    name: "Samsung Galaxy Watch8",
    model: "Galaxy Watch8",
    brand: "samsung",
    category: "okosora",
    skuPrefix: "SAM-GW8",
    description: "Vékony okosóra egészségkövetéssel. Minta termékleírás.",
    procurement: [5, 10],
    createdDay: 21,
    colors: [
      ["#1F1F21", "Grafit"],
      ["#D8D8DA", "Ezüst"],
    ],
    options: { kind: "size", values: [40, 44] },
    prices: [129990, 144990],
    specs: watchSpecs("AMOLED kijelző", "Alváskövetés (minta)"),
  },
  {
    id: "prod-galaxy-watch8-classic",
    slug: "galaxy-watch8-classic",
    name: "Samsung Galaxy Watch8 Classic",
    model: "Galaxy Watch8 Classic",
    brand: "samsung",
    category: "okosora",
    skuPrefix: "SAM-GW8C",
    description:
      "Klasszikus megjelenésű okosóra forgatható lünettával. Minta termékleírás.",
    procurement: [5, 10],
    createdDay: 22,
    colors: [
      ["#1F1F21", "Fekete"],
      ["#F2F2F2", "Fehér"],
    ],
    options: { kind: "size", values: [46] },
    prices: [189990],
    specs: watchSpecs("AMOLED kijelző", "Forgatható lünetta (minta)"),
  },
  {
    id: "prod-galaxy-watch-ultra",
    slug: "galaxy-watch-ultra",
    name: "Samsung Galaxy Watch Ultra",
    model: "Galaxy Watch Ultra",
    brand: "samsung",
    category: "okosora",
    skuPrefix: "SAM-GWU",
    description: "Ellenálló okosóra extrém körülményekhez. Minta termékleírás.",
    procurement: [7, 14],
    createdDay: 23,
    colors: [
      ["#3B3D40", "Titánszürke"],
      ["#EDEDED", "Titánfehér"],
      ["#6E7B6A", null],
    ],
    options: { kind: "size", values: [47] },
    prices: [249990],
    specs: watchSpecs("Zafírkristály kijelző", "Hosszú üzemidő (minta)"),
  },
];

const extraSeeds: ProductSeed[] = [
  {
    id: "prod-xiaomi-15t",
    slug: "xiaomi-15t",
    name: "Xiaomi 15T",
    model: "Xiaomi 15T",
    brand: "xiaomi",
    category: "mobiltelefon",
    skuPrefix: "XIA-15T",
    description: "Nagy teljesítményű telefon kedvező áron. Minta termékleírás.",
    procurement: [5, 12],
    createdDay: 24,
    colors: [
      ["#1A1A1A", "Fekete"],
      ["#C9CCD1", "Ezüst"],
    ],
    options: { kind: "storage", values: [256, 512], ram: [12, 12] },
    prices: [229990, 259990],
    specs: phoneSpecs(
      '6,8"',
      "MediaTek Dimensity",
      "Hármas kamera",
      "Gyorstöltés (minta)"
    ),
  },
  {
    id: "prod-xiaomi-pad-7",
    slug: "xiaomi-pad-7",
    name: "Xiaomi Pad 7",
    model: "Pad 7",
    brand: "xiaomi",
    category: "tablet",
    skuPrefix: "XIA-PAD7",
    description:
      "Könnyű tablet nagy felbontású kijelzővel. Minta termékleírás.",
    procurement: [5, 12],
    createdDay: 25,
    colors: [
      ["#4B4F57", "Grafit"],
      ["#B7C7D9", "Kék"],
    ],
    options: { kind: "storage", values: [128, 256], ram: [8, 8] },
    prices: [139990, 159990],
    specs: phoneSpecs('11,2"', "Snapdragon", "Kamera", "Minta"),
  },
  {
    id: "prod-pixel-10",
    slug: "pixel-10",
    name: "Google Pixel 10",
    model: "Pixel 10",
    brand: "google",
    category: "mobiltelefon",
    skuPrefix: "GOO-PX10",
    description:
      "Tiszta Android-élmény fejlett kamerafunkciókkal. Minta termékleírás.",
    procurement: [7, 14],
    createdDay: 26,
    colors: [
      ["#1F1F1F", "Obszidián"],
      ["#E8E4DA", null],
    ],
    options: { kind: "storage", values: [128, 256], ram: [12, 12] },
    prices: [329990, 369990],
    specs: phoneSpecs('6,3"', "Google Tensor", "Hármas kamera", "Minta"),
  },
  {
    id: "prod-pixel-watch-4",
    slug: "pixel-watch-4",
    name: "Google Pixel Watch 4",
    model: "Pixel Watch 4",
    brand: "google",
    category: "okosora",
    skuPrefix: "GOO-PW4",
    description: "Kerek okosóra egészségkövetéssel. Minta termékleírás.",
    procurement: [7, 14],
    createdDay: 27,
    colors: [
      ["#2A2A2C", "Matt fekete"],
      ["#E6E1D6", "Porcelán"],
    ],
    options: { kind: "size", values: [41, 45] },
    prices: [139990, 159990],
    specs: watchSpecs("AMOLED kijelző", "Pulzusmérés (minta)"),
  },
  {
    id: "prod-airpods-pro-3",
    slug: "airpods-pro-3",
    name: "Apple AirPods Pro 3",
    model: "AirPods Pro 3",
    brand: "apple",
    category: "fulhallgato",
    skuPrefix: "APL-APP3",
    description: "Aktív zajszűrős fülhallgató töltőtokkal. Minta termékleírás.",
    procurement: [3, 7],
    createdDay: 28,
    colors: [["#FFFFFF", "Fehér"]],
    options: { kind: "none", values: [0] },
    prices: [109990],
    specs: watchSpecs("Fülbe helyezhető", "Aktív zajszűrés (minta)"),
  },
  {
    id: "prod-galaxy-buds4-pro",
    slug: "galaxy-buds4-pro",
    name: "Samsung Galaxy Buds4 Pro",
    model: "Galaxy Buds4 Pro",
    brand: "samsung",
    category: "fulhallgato",
    skuPrefix: "SAM-BUDS4P",
    description: "Prémium vezeték nélküli fülhallgató. Minta termékleírás.",
    procurement: [3, 7],
    createdDay: 29,
    colors: [
      ["#3A3A3C", "Grafit"],
      ["#F4F4F4", "Fehér"],
    ],
    options: { kind: "none", values: [0] },
    prices: [89990],
    specs: watchSpecs("Fülbe helyezhető", "Aktív zajszűrés (minta)"),
  },
];

const products: Product[] = [...productSeeds, ...extraSeeds].map(buildProduct);

const settings: StoreSettings = {
  storeName: "Benyom Webshop",
  isSampleContent: true,
  contact: {
    email: "info@minta-webshop.example",
    phone: "+36 1 000 0000 (fiktív)",
    address: "0000 Mintaváros, Példa utca 1. (fiktív cím)",
  },
  storeNotificationEmail: "rendelesek@minta-webshop.example",
  contactRecipientEmail: "kapcsolat@minta-webshop.example",
  collection: {
    address: "0000 Mintaváros, Példa utca 1. (fiktív átvételi pont)",
    openingHours: [
      "Hétfő–Péntek: 9:00–17:00",
      "Szombat: 9:00–12:00",
      "Vasárnap: zárva",
    ],
    note: "Átvétel előtt e-mailben értesítjük. A fizetés átvételkor, a helyszínen történik.",
  },
  deliveryMethods: [
    {
      id: "szemelyes-atvetel",
      kind: "collection",
      name: "Személyes átvétel",
      description: "Átvétel az üzletben, fizetés a helyszínen.",
      enabled: true,
      fee: { kind: "free" },
    },
    {
      id: "hazhozszallitas",
      kind: "delivery",
      name: "Házhozszállítás futárral",
      description:
        "Kiszállítás a megadott címre, fizetés a futárnál. A díj fiktív mintaérték.",
      enabled: true,
      fee: { kind: "fixed", amount: 2990, isSampleValue: true },
    },
    {
      id: "csomagautomata",
      kind: "delivery",
      name: "Csomagautomata",
      description:
        "Előkészítés alatt – a díj még nincs meghatározva, ezért nem választható.",
      enabled: true,
      fee: { kind: "unknown" },
    },
  ],
  legal: {
    termsVersion: "MINTA-ASZF-2026-11",
    privacyVersion: "MINTA-ADATVEDELEM-2026-11",
  },
  seo: {
    defaultTitle:
      "Benyom Webshop – telefonok, tabletek és okosórák előrendelésre",
    defaultDescription:
      "Apple és Samsung készülékek előrendelése. Fizetés személyes átvételkor vagy kiszállításkor. (Mintaáruház)",
  },
  homepage: {
    heroTitle: "Előrendelés egyszerűen, fizetés átvételkor",
    heroText:
      "Válassza ki a készüléket és a változatot, adja le előrendelését – online fizetés nélkül. Az árat átvételkor vagy kiszállításkor kell kiegyenlíteni.",
    featuredHeading: "Kiemelt termékek",
    highlights: [
      {
        title: "Nincs online fizetés",
        text: "Fizetés személyes átvételkor vagy a futárnál.",
      },
      {
        title: "Rögzített ár",
        text: "A leadott rendelés ára csak az Ön kifejezett jóváhagyásával változhat.",
      },
      {
        title: "Átlátható folyamat",
        text: "E-mailben értesítjük a rendelés minden fontos lépéséről.",
      },
    ],
  },
  pages: [
    {
      slug: "aszf",
      title: "Általános szerződési feltételek",
      paragraphs: [
        "Mintaszöveg – ez nem valós jogi dokumentum. A végleges ÁSZF-et jogi szakértővel kell elkészíteni.",
        "Az oldalon leadott rendelés előrendelésnek minősül. Online fizetés nincs; a vételár átvételkor vagy kiszállításkor fizetendő.",
        "Ha a beszerzési ár a rendelés leadása után megváltozik, árváltozási ajánlatot küldünk. Elfogadás nélkül az eredeti ár marad érvényben; elutasítás esetén a teljes rendelés törlődik.",
      ],
    },
    {
      slug: "adatvedelem",
      title: "Adatkezelési tájékoztató",
      paragraphs: [
        "Mintaszöveg – ez nem valós adatkezelési tájékoztató.",
        "A rendeléshez megadott adatokat kizárólag a rendelés teljesítéséhez és a kapcsolódó értesítésekhez használjuk.",
      ],
    },
    {
      slug: "garancia",
      title: "Garancia és jótállás",
      paragraphs: [
        "Mintaszöveg – a jótállási feltételeket a végleges üzlet adja meg.",
      ],
    },
  ],
};

const orders: Order[] = [
  {
    id: "order-sample-1",
    reference: "BNY-MNTA-0001",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    submissionHash: "sample-1",
    submission: {
      submittedAt: daysAfterBase(10),
      lines: [
        {
          lineId: "line-1",
          productId: "prod-iphone-17",
          productName: "Apple iPhone 17",
          productSlug: "iphone-17",
          brandName: "Apple",
          sku: "APL-IP17-256-01",
          attributes: {
            colorHex: "#1C1C1E",
            colorLabel: "Fekete",
            storageGb: 256,
            ramGb: null,
            caseSizeMm: null,
          },
          unitPrice: 449990,
          quantity: 1,
          lineTotal: 449990,
          catalogUnitPrice: 449990,
          priceSource: "quote",
        },
      ],
      delivery: {
        methodId: "szemelyes-atvetel",
        kind: "collection",
        name: "Személyes átvétel",
        fee: 0,
      },
      totals: {
        itemsTotal: 449990,
        deliveryFee: 0,
        grandTotal: 449990,
        currency: "HUF",
      },
      customer: {
        name: "Minta Anna",
        email: "anna.minta@example.com",
        phone: "+36 30 000 0001",
        companyName: null,
        taxNumber: null,
      },
      billingAddress: {
        postalCode: "0000",
        city: "Mintaváros",
        street: "Próba utca 2.",
        country: "HU",
      },
      shippingAddress: null,
      note: null,
      terms: {
        termsVersion: "MINTA-ASZF-2026-11",
        privacyVersion: "MINTA-ADATVEDELEM-2026-11",
        acceptedAt: daysAfterBase(10),
      },
    },
    agreed: {
      lines: [{ lineId: "line-1", unitPrice: 449990, lineTotal: 449990 }],
      totals: {
        itemsTotal: 449990,
        deliveryFee: 0,
        grandTotal: 449990,
        currency: "HUF",
      },
      source: "submission",
      proposalId: null,
      agreedAt: daysAfterBase(10),
    },
    fulfillmentStatus: "completed",
    paymentStatus: "paid",
    priceApprovalStatus: "not_required",
    needsPriceReview: false,
    adminNotes: [
      {
        at: daysAfterBase(14),
        text: "Átvéve, készpénzzel fizetve (mintaadat).",
      },
    ],
    events: [
      {
        id: "ev-1-1",
        at: daysAfterBase(10),
        type: "submitted",
        actor: "customer",
        message: "Előrendelés leadva.",
      },
      {
        id: "ev-1-2",
        at: daysAfterBase(14),
        type: "status_changed",
        actor: "admin",
        message: "Állapot: Teljesítve.",
      },
    ],
    notifications: [],
    cancellation: null,
    version: 3,
    createdAt: daysAfterBase(10),
    updatedAt: daysAfterBase(14),
    isSample: true,
  },
  {
    // Price-change scenario: a still-valid quote was below the catalog price at submission.
    id: "order-sample-2",
    reference: "BNY-MNTA-0002",
    idempotencyKey: "00000000-0000-4000-8000-000000000002",
    submissionHash: "sample-2",
    submission: {
      submittedAt: daysAfterBase(30),
      lines: [
        {
          lineId: "line-1",
          productId: "prod-galaxy-s26-ultra",
          productName: "Samsung Galaxy S26 Ultra",
          productSlug: "galaxy-s26-ultra",
          brandName: "Samsung",
          sku: "SAM-S26U-512-02",
          attributes: {
            colorHex: "#B8C6D4",
            colorLabel: "Titánkék",
            storageGb: 512,
            ramGb: 12,
            caseSizeMm: null,
          },
          unitPrice: 619990,
          quantity: 1,
          lineTotal: 619990,
          catalogUnitPrice: 639990,
          priceSource: "quote",
        },
      ],
      delivery: {
        methodId: "hazhozszallitas",
        kind: "delivery",
        name: "Házhozszállítás futárral",
        fee: 2990,
      },
      totals: {
        itemsTotal: 619990,
        deliveryFee: 2990,
        grandTotal: 622980,
        currency: "HUF",
      },
      customer: {
        name: "Példa Bence",
        email: "bence.pelda@example.com",
        phone: "+36 20 000 0002",
        companyName: "Példa Kft. (fiktív)",
        taxNumber: "12345678-1-12",
      },
      billingAddress: {
        postalCode: "0000",
        city: "Mintaváros",
        street: "Teszt tér 3.",
        country: "HU",
      },
      shippingAddress: {
        postalCode: "0000",
        city: "Mintaváros",
        street: "Teszt tér 3.",
        country: "HU",
      },
      note: "Délelőtti kiszállítást kérek (mintaadat).",
      terms: {
        termsVersion: "MINTA-ASZF-2026-11",
        privacyVersion: "MINTA-ADATVEDELEM-2026-11",
        acceptedAt: daysAfterBase(30),
      },
    },
    agreed: {
      lines: [{ lineId: "line-1", unitPrice: 619990, lineTotal: 619990 }],
      totals: {
        itemsTotal: 619990,
        deliveryFee: 2990,
        grandTotal: 622980,
        currency: "HUF",
      },
      source: "submission",
      proposalId: null,
      agreedAt: daysAfterBase(30),
    },
    fulfillmentStatus: "received",
    paymentStatus: "unpaid",
    priceApprovalStatus: "not_required",
    needsPriceReview: true,
    adminNotes: [],
    events: [
      {
        id: "ev-2-1",
        at: daysAfterBase(30),
        type: "submitted",
        actor: "customer",
        message: "Előrendelés leadva.",
      },
      {
        id: "ev-2-2",
        at: daysAfterBase(30),
        type: "price_review_flagged",
        actor: "system",
        message:
          "Érvényes ajánlati ár alacsonyabb a katalógusárnál – árellenőrzés javasolt.",
      },
    ],
    notifications: [],
    cancellation: null,
    version: 2,
    createdAt: daysAfterBase(30),
    updatedAt: daysAfterBase(30),
    isSample: true,
  },
];

const proposals: PriceChangeProposal[] = [];

/** Runtime-frozen so accidental mutation throws in strict mode. The DTO layer works on clones. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

export const sampleData: SampleData = deepFreeze<SampleData>({
  brands,
  categories,
  products,
  orders,
  proposals,
  settings,
});
