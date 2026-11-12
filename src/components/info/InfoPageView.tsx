import type React from "react";

import { InfoPageLayout } from "@/components/info/InfoPageLayout";
import type { InfoPage } from "@/types/settings";

type InfoPageViewProps = {
  page: InfoPage;
};

/** A store-settings information page: paragraphs, then its FAQ (if any) as an accordion. Used by /info/[slug] and /gyik. */
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
