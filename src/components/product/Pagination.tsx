import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { Button } from '@/components/shadcn/button'
import { listingQueryToParams } from '@/schemas/listing'
import type { ProductQuery } from '@/types/catalog'

type PaginationProps = {
  basePath: string
  query: ProductQuery
  page: number
  totalPages: number
  omit: ReadonlyArray<'brand' | 'category'>
}

export function Pagination(props: PaginationProps): React.JSX.Element | null {
  if (props.totalPages <= 1) return null
  const href = (page: number): string => {
    const params = listingQueryToParams({ ...props.query, page }, props.omit)
    const search = params.toString()
    return search ? `${props.basePath}?${search}` : props.basePath
  }
  const pages = Array.from({ length: props.totalPages }, (_: unknown, index: number) => index + 1)
  return (
    <nav aria-label="Lapozás" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {props.page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(props.page - 1)} rel="prev">
            <ChevronLeftIcon aria-hidden="true" />
            Előző
          </Link>
        </Button>
      ) : null}
      {pages.map((page: number) => (
        <Button key={page} asChild variant={page === props.page ? 'default' : 'outline'} size="icon-sm">
          <Link href={href(page)} aria-current={page === props.page ? 'page' : undefined}>
            <span className="sr-only">Oldal </span>
            {page}
          </Link>
        </Button>
      ))}
      {props.page < props.totalPages ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(props.page + 1)} rel="next">
            Következő
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
    </nav>
  )
}
