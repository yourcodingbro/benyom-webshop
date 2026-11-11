import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

import { cn } from '@/lib/utils'
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
        <Link href={href(props.page - 1)} className="inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm hover:bg-muted" rel="prev">
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          Előző
        </Link>
      ) : null}
      {pages.map((page: number) => (
        <Link
          key={page}
          href={href(page)}
          aria-current={page === props.page ? 'page' : undefined}
          className={cn('flex size-10 items-center justify-center rounded-full border text-sm', page === props.page ? 'border-ink bg-ink text-white' : 'hover:bg-muted')}
        >
          <span className="sr-only">Oldal </span>
          {page}
        </Link>
      ))}
      {props.page < props.totalPages ? (
        <Link href={href(props.page + 1)} className="inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm hover:bg-muted" rel="next">
          Következő
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </nav>
  )
}
