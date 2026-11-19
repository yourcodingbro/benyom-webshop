import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { Reveal } from '@/components/Reveal'
import { Button } from '@/components/shadcn/button'
import { Skeleton } from '@/components/shadcn/skeleton'

export type PopularSelectorItem = {
  key: string
  label: string
  description: string
  href: string
}

type PopularSelectorProps = {
  id: string
  title: string
  items: PopularSelectorItem[]
  viewAll: { label: string; href: string }
  delay?: number
}

/** Homepage block listing the top-ranked brands or categories plus a "view all" button. */
export function PopularSelector(props: PopularSelectorProps): React.JSX.Element {
  return (
    <section aria-labelledby={props.id} className="flex h-full flex-col rounded-2xl border bg-card p-5 sm:p-6">
      <Reveal delay={props.delay}>
        <h2 id={props.id} className="border-l-4 border-brand-red pl-3 text-xl font-bold sm:text-2xl">
          {props.title}
        </h2>
      </Reveal>
      <ol className="mt-5 flex-1 space-y-3">
        {props.items.map((item: PopularSelectorItem, index: number) => (
          <li key={item.key}>
            {/* Each row enters on its own (same settings as the product cards); the list itself stays visible. */}
            <Reveal trigger="enter" index={index}>
              <Link href={item.href} className="group flex items-center gap-3 rounded-xl bg-muted p-4 transition-colors hover:bg-secondary/70">
                <span className="min-w-0 flex-1">
                  <span className="font-heading block font-bold text-ink">{item.label}</span>
                  <span className="block text-sm text-muted-foreground">{item.description}</span>
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </Reveal>
          </li>
        ))}
      </ol>
      <Button asChild variant="outline" className="mt-5 self-start">
        <Link href={props.viewAll.href}>
          {props.viewAll.label}
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </Button>
    </section>
  )
}

/** PopularSelector placeholder: heading, three ranked rows (name + description) and the "all" button. */
export function PopularSelectorSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col rounded-2xl border bg-card p-5 sm:p-6" aria-hidden="true">
      <Skeleton className="h-7 w-48 sm:h-8" />
      <div className="mt-5 flex-1 space-y-3">
        {[0, 1, 2].map((row: number) => (
          <div key={row} className="flex items-center gap-3 rounded-xl bg-muted p-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-32 bg-background/70" />
              <Skeleton className="h-4 w-3/4 bg-background/70" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-10 w-40 rounded-full" />
    </div>
  )
}
