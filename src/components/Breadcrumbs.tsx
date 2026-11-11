import Link from 'next/link'
import type React from 'react'
import { Fragment } from 'react'

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/shadcn/breadcrumb'

export type BreadcrumbEntry = {
  label: string
  href?: string
}

type BreadcrumbsProps = {
  items: BreadcrumbEntry[]
}

export function Breadcrumbs(props: BreadcrumbsProps): React.JSX.Element {
  const items: BreadcrumbEntry[] = [{ label: 'Főoldal', href: '/' }, ...props.items]
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {items.map((item: BreadcrumbEntry, index: number) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {item.href && index < items.length - 1 ? (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
