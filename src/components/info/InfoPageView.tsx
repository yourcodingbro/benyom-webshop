import type React from "react";

import { InfoPageLayout } from "@/components/info/InfoPageLayout";
import type { InfoPage } from "@/types/settings";

type InfoPageViewProps = {
  page: InfoPage;
};

/** A store-settings information page (its paragraphs). Used by /info/[slug]. */
export function InfoPageView(props: InfoPageViewProps): React.JSX.Element {
  const { page } = props;
  return (
    <InfoPageLayout title={page.title}>
      {page.paragraphs.map((paragraph: string) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </InfoPageLayout>
  );
}
