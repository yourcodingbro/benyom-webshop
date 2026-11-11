import { ArrowLeftIcon } from 'lucide-react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import type React from 'react'

import { OrderSummary } from '@/components/checkout/OrderSummary'
import { Reveal } from '@/components/Reveal'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { ORDER_ACCESS_COOKIE } from '@/config/shop'
import { orderService } from '@/services/orderService'

export const metadata: Metadata = { title: 'Köszönjük előrendelését', robots: { index: false, follow: false } }

/** Order details are shown only to the browser holding the httpOnly access cookie – never via URL. */
export default async function ConfirmationPage(): Promise<React.JSX.Element> {
  const raw = (await cookies()).get(ORDER_ACCESS_COOKIE)?.value ?? ''
  const separator = raw.indexOf('.')
  const order = separator > 0 ? await orderService.getOrderForCustomer(raw.slice(0, separator), raw.slice(separator + 1)) : null

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {order ? (
        <Reveal>
          <h1 className="text-3xl font-bold">Köszönjük, megkaptuk előrendelését!</h1>
          <p className="mt-3 text-muted-foreground">
            Visszaigazolást küldtünk a(z) <strong>{order.submission.customer.email}</strong> címre (minta módban csak a fejlesztői naplóba).
          </p>
          <Alert className="my-6">
            <AlertTitle>Most nem kell fizetnie</AlertTitle>
            <AlertDescription>
              A vételárat {order.submission.delivery.kind === 'collection' ? 'személyes átvételkor' : 'kiszállításkor, a futárnál'} kell kiegyenlíteni. Ha a beszerzési ár változna, e-mailben kérjük a jóváhagyását – az ár nélküle nem változik.
            </AlertDescription>
          </Alert>
          <OrderSummary order={order} />
        </Reveal>
      ) : (
        <>
          <h1 className="text-3xl font-bold">A rendelés részletei nem érhetők el</h1>
          <p className="mt-3 text-muted-foreground">A rendelés adatait biztonsági okból csak a leadáshoz használt böngészőben, korlátozott ideig jelenítjük meg. A visszaigazolást e-mailben is elküldjük.</p>
        </>
      )}
      <Link href="/termekek" className="mt-8 inline-flex items-center gap-1 font-semibold text-primary underline">
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Vissza a termékekhez
      </Link>
    </div>
  )
}
