import type { Metadata } from 'next'
import type React from 'react'

import { InfoPageLayout } from '@/components/info/InfoPageLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { getStoreSettings } from '@/dto/settings'
import { describeDeliveryFee } from '@/lib/delivery'
import type { DeliveryMethod } from '@/types/settings'

export const metadata: Metadata = {
  title: 'Fizetés és szállítás',
  description: 'Fizetés átvételkor vagy kiszállításkor, személyes átvétel és házhozszállítás előrendelés esetén.',
  alternates: { canonical: '/fizetes-es-szallitas' },
}

function feeNote(method: DeliveryMethod): string | null {
  if (method.fee.kind === 'unknown') return 'Ehhez a módhoz még nincs beállított díj, ezért rendeléskor nem választható.'
  if (method.fee.kind === 'fixed' && method.fee.isSampleValue) return 'A díj fiktív mintaérték, nem a végleges ár.'
  return null
}

/** Store-settings driven payment and delivery details, laid out like the other informational pages. */
export default async function PaymentAndDeliveryPage(): Promise<React.JSX.Element> {
  const settings = await getStoreSettings()
  const methods = settings.deliveryMethods.filter((method: DeliveryMethod) => method.enabled)

  return (
    <InfoPageLayout title="Fizetés és szállítás">
      <p>Előrendelés esetén online fizetés nincs: a vételárat személyes átvételkor vagy kiszállításkor kell kiegyenlíteni.</p>

      {settings.isSampleContent ? (
        <Alert>
          <AlertTitle>Mintaadatok</AlertTitle>
          <AlertDescription>Az alábbi díjak, címek és nyitvatartás fiktív mintaértékek. A végleges adatokat az áruház beállításaiban kell megadni.</AlertDescription>
        </Alert>
      ) : null}

      <h2>Fizetés</h2>
      <ul>
        <li>Személyes átvételnél a helyszínen, kiszállításnál a futárnál fizet.</li>
        <li>Online fizetés nincs, bankkártyaadatot nem kérünk, és a rendelés leadásakor semmit nem kell fizetni.</li>
        <li>Számlát a webshop nem állít ki automatikusan.</li>
      </ul>

      <h2>Átvételi és szállítási módok</h2>
      <ul>
        {methods.map((method: DeliveryMethod) => {
          const note = feeNote(method)
          const fee = describeDeliveryFee(method.fee)
          const kind = method.kind === 'collection' ? 'személyes átvétel' : 'kiszállítás'
          return (
            <li key={method.id}>
              <strong className="text-ink">{method.name}</strong>
              {method.name.toLowerCase() === kind ? null : <span className="text-muted-foreground"> · {kind}</span>}
              <br />
              {method.description}
              <br />
              <span className="font-semibold text-ink">{method.fee.kind === 'unknown' ? fee : `Díj: ${fee}`}</span>
              {note ? <span className="block text-sm text-muted-foreground">{note}</span> : null}
            </li>
          )
        })}
      </ul>

      <h2>Személyes átvétel</h2>
      <p>{settings.collection.address}</p>
      <h3>Nyitvatartás</h3>
      <ul>
        {settings.collection.openingHours.map((line: string) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{settings.collection.note}</p>

      <h2>Az előrendelés menete</h2>
      <ol>
        <li>A leadott rendelést e-mailben visszaigazoljuk, majd megkezdjük a beszerzést.</li>
        <li>A termékoldalakon látható beszerzési idő becslés, nem garantált határidő.</li>
        <li>Ha a beszerzési ár változna, árváltozási ajánlatot küldünk; az ár csak az Ön kifejezett elfogadásával módosul. Elutasítás esetén a teljes rendelés törlődik.</li>
        <li>Amikor a rendelés átvehető vagy úton van, e-mailben értesítjük.</li>
      </ol>
    </InfoPageLayout>
  )
}
