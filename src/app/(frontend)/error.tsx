'use client'

import { RotateCcwIcon } from 'lucide-react'
import type React from 'react'

import { Button } from '@/components/shadcn/button'

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage(props: ErrorPageProps): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6" role="alert">
      <h1 className="text-2xl font-bold">Hiba történt</h1>
      <p className="mt-2 text-muted-foreground">Az oldal betöltése nem sikerült. Kérjük, próbálja újra.</p>
      {props.error.digest ? <p className="mt-1 text-xs text-muted-foreground">Hibakód: {props.error.digest}</p> : null}
      <Button className="mt-6" onClick={props.reset}>
        <RotateCcwIcon aria-hidden="true" />
        Újrapróbálás
      </Button>
    </div>
  )
}
