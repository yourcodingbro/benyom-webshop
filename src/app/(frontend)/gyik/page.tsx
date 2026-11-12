import type { Metadata } from "next";
import type React from "react";

import { getInfoPage } from "@/dto/settings";
import { infoPagePath } from "@/lib/info-pages";
import { InfoPageLayout } from "@/components/info/InfoPageLayout";
import { FaqAccordion } from "@/components/info/FaqAccordion";

const FAQ_SLUG: string = "gyik";

// TODO: fix metadata
export async function generateMetadata(): Promise<Metadata> {
  const page = await getInfoPage(FAQ_SLUG);
  return page
    ? { title: page.title, alternates: { canonical: infoPagePath(FAQ_SLUG) } }
    : {};
}

/** FAQ: the "gyik" information page from the store settings, with its questions as an accordion. */
export default async function FaqPage(): Promise<React.JSX.Element> {
  return (
    <InfoPageLayout title="Gyakori kérdések">
      <FaqAccordion />
    </InfoPageLayout>
  );
}
