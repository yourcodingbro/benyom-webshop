import { BanknoteIcon, ClockIcon, MapPinIcon, PackageIcon, TruckIcon } from 'lucide-react'
import type { Metadata } from 'next'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Reveal } from '@/components/Reveal'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Badge } from '@/components/shadcn/badge'
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

/** Everything on this page comes from the store settings; nothing is hard-coded. */
export default async function PaymentAndDeliveryPage(): Promise<React.JSX.Element> {
  const settings = await getStoreSettings()
  const methods = settings.deliveryMethods.filter((method: DeliveryMethod) => method.enabled)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: 'Fizetés és szállítás' }]} />
      <Reveal>
        <h1 className="text-3xl font-bold sm:text-4xl">Fizetés és szállítás</h1>
        <p className="mt-2 text-muted-foreground">Előrendelés esetén online fizetés nincs: a vételárat személyes átvételkor vagy kiszállításkor kell kiegyenlíteni.</p>
      </Reveal>

      {settings.isSampleContent ? (
        <Alert className="mt-6">
          <AlertTitle>Mintaadatok</AlertTitle>
          <AlertDescription>Az alábbi díjak, címek és nyitvatartás fiktív mintaértékek. A végleges adatokat az áruház beállításaiban kell megadni.</AlertDescription>
        </Alert>
      ) : null}

      <Reveal>
        <section aria-labelledby="fizetes" className="mt-10">
          <h2 id="fizetes" className="flex items-center gap-2 text-xl font-bold">
            <BanknoteIcon className="size-5 text-primary" aria-hidden="true" />
            Fizetés
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>Személyes átvételnél a helyszínen, kiszállításnál a futárnál fizet.</li>
            <li>Online fizetés nincs, bankkártyaadatot nem kérünk, és a rendelés leadásakor semmit nem kell fizetni.</li>
            <li>Számlát a webshop nem állít ki automatikusan.</li>
          </ul>
        </section>
      </Reveal>

      <Reveal>
        <section aria-labelledby="atvetel" className="mt-10">
          <h2 id="atvetel" className="flex items-center gap-2 text-xl font-bold">
            <TruckIcon className="size-5 text-primary" aria-hidden="true" />
            Átvételi és szállítási módok
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {methods.map((method: DeliveryMethod) => {
              const note = feeNote(method)
              const unavailable = method.fee.kind === 'unknown'
              return (
                <li key={method.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{method.name}</h3>
                    <Badge variant="outline">{method.kind === 'collection' ? 'Személyes átvétel' : 'Kiszállítás'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{method.description}</p>
                  <p className={unavailable ? 'mt-2 text-sm font-semibold text-muted-foreground' : 'mt-2 font-semibold text-ink'}>{unavailable ? describeDeliveryFee(method.fee) : `Díj: ${describeDeliveryFee(method.fee)}`}</p>
                  {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
                </li>
              )
            })}
          </ul>
        </section>
      </Reveal>

      <Reveal>
        <section aria-labelledby="szemelyes" className="mt-10 rounded-xl bg-muted p-5">
          <h2 id="szemelyes" className="flex items-center gap-2 text-xl font-bold">
            <MapPinIcon className="size-5 text-primary" aria-hidden="true" />
            Személyes átvétel
          </h2>
          <p className="mt-3">{settings.collection.address}</p>
          <h3 className="mt-4 flex items-center gap-2 font-semibold">
            <ClockIcon className="size-4" aria-hidden="true" />
            Nyitvatartás
          </h3>
          <ul className="mt-1">
            {settings.collection.openingHours.map((line: string) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm">{settings.collection.note}</p>
        </section>
      </Reveal>

      <Reveal>
        <section aria-labelledby="elorendeles" className="mt-10">
          <h2 id="elorendeles" className="flex items-center gap-2 text-xl font-bold">
            <PackageIcon className="size-5 text-primary" aria-hidden="true" />
            Az előrendelés menete
          </h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>A leadott rendelést e-mailben visszaigazoljuk, majd megkezdjük a beszerzést.</li>
            <li>A termékoldalakon látható beszerzési idő becslés, nem garantált határidő.</li>
            <li>Ha a beszerzési ár változna, árváltozási ajánlatot küldünk; az ár csak az Ön kifejezett elfogadásával módosul. Elutasítás esetén a teljes rendelés törlődik.</li>
            <li>Amikor a rendelés átvehető vagy úton van, e-mailben értesítjük.</li>
          </ol>
        </section>
      </Reveal>
    </div>
  )
}
