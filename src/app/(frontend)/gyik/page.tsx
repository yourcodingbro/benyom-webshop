import type { Metadata } from "next";
import type React from "react";

import { FaqAccordion } from "@/components/info/FaqAccordion";
import { InfoPageLayout } from "@/components/info/InfoPageLayout";

const TITLE: string = "Gyakori kérdések";

export const metadata: Metadata = {
  title: TITLE,
  alternates: { canonical: "/gyik" },
};

/** FAQ page: the standalone accordion in the shared information-page layout (no settings fetch). */
export default function FaqPage(): React.JSX.Element {
  return (
    <InfoPageLayout title={TITLE}>
      <FaqAccordion />
    </InfoPageLayout>
  );
}
