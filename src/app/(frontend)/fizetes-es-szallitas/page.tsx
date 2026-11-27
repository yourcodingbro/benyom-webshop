import type { Metadata } from "next";
import type React from "react";

import { InfoPageLayout } from "@/components/info/InfoPageLayout";
import { PAGE_DESCRIPTIONS } from "@/config/seo";
import { getPaymentSettings } from "@/dto/settings";
import { describeDeliveryFee } from "@/lib/delivery";
import type { DeliveryMethod } from "@/types/settings";

/** Code-managed metadata; the visible content comes from Fizetési és szállítási beállítások. */
export const metadata: Metadata = {
  title: "Fizetés és szállítás",
  description: PAGE_DESCRIPTIONS.paymentAndDelivery,
  alternates: { canonical: "/fizetes-es-szallitas" },
};

/**
 * Payment and delivery page, entirely from Fizetési és szállítási beállítások: the page texts, the delivery methods with
 * fees and the collection point (the same source the checkout uses).
 */
export default async function PaymentAndDeliveryPage(): Promise<React.JSX.Element> {
  const settings = await getPaymentSettings();
  const content = settings.paymentPage;
  const methods = settings.deliveryMethods.filter(
    (method: DeliveryMethod) => method.enabled
  );

  return (
    <InfoPageLayout title={content.title}>
      {content.intro ? <p className="whitespace-pre-line">{content.intro}</p> : null}

      <h2>{content.paymentHeading}</h2>
      {content.paymentItems.length > 0 ? (
        <ul>
          {content.paymentItems.map((item: string, index: number) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : null}

      <h2>{content.methodsHeading}</h2>
      <ul>
        {methods.map((method: DeliveryMethod) => {
          const kind =
            method.kind === "collection" ? "személyes átvétel" : "kiszállítás";
          return (
            <li key={method.id}>
              <strong className="text-ink">{method.name}</strong>
              {method.name.toLowerCase() === kind ? null : (
                <span className="text-muted-foreground"> · {kind}</span>
              )}
              <br />
              {method.description}
              <br />
              <span className="font-semibold text-ink">Díj: {describeDeliveryFee(method.fee)}</span>
            </li>
          );
        })}
      </ul>

      <h2>{content.collectionHeading}</h2>
      <p>{settings.collection.address}</p>
      <h3>{content.openingHoursHeading}</h3>
      <ul>
        {settings.collection.openingHours.map((line: string) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{settings.collection.note}</p>

      <h2>{content.processHeading}</h2>
      {content.processSteps.length > 0 ? (
        <ol>
          {content.processSteps.map((step: string, index: number) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      ) : null}
    </InfoPageLayout>
  );
}
