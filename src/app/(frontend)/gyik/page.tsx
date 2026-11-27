import type { Metadata } from "next";
import type React from "react";

import { FaqAccordion } from "@/components/info/FaqAccordion";
import { InfoPageLayout } from "@/components/info/InfoPageLayout";
import { getPublishedFaqs } from "@/dto/settings";

const TITLE: string = "Gyakori kérdések";

/** Code-managed metadata; the questions come from GYIK beállítások. */
export const metadata: Metadata = {
  title: TITLE,
  alternates: { canonical: "/gyik" },
};

/** FAQ page: the published questions in their manual order, in the shared information-page layout. */
export default async function FaqPage(): Promise<React.JSX.Element> {
  const items = await getPublishedFaqs();
  return (
    <InfoPageLayout title={TITLE}>
      <FaqAccordion items={items} />
    </InfoPageLayout>
  );
}
