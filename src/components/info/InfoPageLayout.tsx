import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'

type InfoPageLayoutProps = {
  title: string
  children: React.ReactNode
}

/**
 * Shared frame for informational pages (terms, privacy, FAQ, payment & delivery): narrow reading
 * width, breadcrumbs, title, and body copy with even vertical rhythm. Section headings inside use
 * the `h2` style below, so every info page reads the same.
 */
export function InfoPageLayout(props: InfoPageLayoutProps): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: props.title }]} />
      <h1 className="text-3xl font-bold">{props.title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {props.children}
      </div>
    </div>
  )
}
