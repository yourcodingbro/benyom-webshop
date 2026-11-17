import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Skeleton } from '@/components/shadcn/skeleton'

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

type InfoPageLayoutSkeletonProps = {
  /** Body placeholder; defaults to paragraph blocks (a page with its own body skeleton passes it). */
  children?: React.ReactNode
}

const PARAGRAPH_LINES: readonly string[][] = [['w-full', 'w-full', 'w-11/12', 'w-3/5'], ['w-full', 'w-10/12', 'w-2/3'], ['w-full', 'w-full', 'w-1/2']]

/** InfoPageLayout placeholder: breadcrumbs, title and text blocks at the same reading width. */
export function InfoPageLayoutSkeleton(props: InfoPageLayoutSkeletonProps): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" aria-hidden="true">
      <Skeleton className="mb-4 h-5 w-40" />
      <Skeleton className="h-9 w-2/3" />
      <div className="mt-6 space-y-6">
        {props.children ??
          PARAGRAPH_LINES.map((paragraph: string[], index: number) => (
            <div key={index} className="space-y-2.5">
              {paragraph.map((width: string, line: number) => (
                <Skeleton key={line} className={`h-4 ${width}`} />
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
