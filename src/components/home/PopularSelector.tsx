import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { Reveal } from '@/components/Reveal'
import { Button } from '@/components/shadcn/button'

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
        {props.items.map((item: PopularSelectorItem) => (
          <li key={item.key}>
            <Link href={item.href} className="group flex items-center gap-3 rounded-xl bg-muted p-4 transition-colors hover:bg-secondary/70">
              <span className="min-w-0 flex-1">
                <span className="font-heading block font-bold text-ink">{item.label}</span>
                <span className="block text-sm text-muted-foreground">{item.description}</span>
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
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
