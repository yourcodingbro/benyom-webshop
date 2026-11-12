import Link from "next/link";
import type React from "react";

import { CartDrawer } from "@/components/cart/CartDrawer";
import { Logo } from "@/components/Logo";
import { MobileNav, type NavigationEntry } from "@/components/layout/MobileNav";
import { SearchForm } from "@/components/layout/SearchForm";
import { Button } from "@/components/shadcn/button";
import type { BrandNavigationItem } from "@/services/catalogService";

type SiteHeaderProps = {
  storeName: string;
  navigation: BrandNavigationItem[];
};

type DesktopLink = { label: string; href: string };

/** Desktop-only primary links. Brand browsing lives on the homepage, /markak and the mobile menu; payment & delivery is linked from the footer. */
const DESKTOP_LINKS: readonly DesktopLink[] = [
  { label: "Összes termék", href: "/termekek" },
  { label: "Kapcsolat", href: "/kapcsolat" },
];

/** Dark sticky header (benyom.hu style). The mobile menu keeps the brand/category navigation. */
export function SiteHeader(props: SiteHeaderProps): React.JSX.Element {
  const mobileNavigation: NavigationEntry[] = props.navigation.map(
    (item: BrandNavigationItem) => ({
      brandName: item.brand.name,
      brandSlug: item.brand.slug,
      categories: item.categories.map((category) => ({
        name: category.name,
        slug: category.slug,
      })),
    })
  );

  return (
    <header className="sticky top-0 z-40 bg-ink text-white shadow-md">
      <a
        href="#tartalom"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
      >
        Ugrás a tartalomra
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <MobileNav navigation={mobileNavigation} />
        <Logo storeName={props.storeName} />
        <nav aria-label="Fő navigáció" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {DESKTOP_LINKS.map((link: DesktopLink) => (
              <li key={link.href}>
                <Button asChild variant="ghostInverse" size="sm">
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <SearchForm
          id="fejlec-kereses"
          className="ml-auto hidden w-56 md:block xl:w-72"
        />
        <div className="ml-auto md:ml-2">
          <CartDrawer />
        </div>
      </div>
    </header>
  );
}
