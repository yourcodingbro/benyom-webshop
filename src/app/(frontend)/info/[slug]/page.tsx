import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'

import { InfoPageView } from '@/components/info/InfoPageView'
import { getInfoPage } from '@/dto/settings'
import { hasDedicatedRoute, infoPagePath } from '@/lib/info-pages'
import type { InfoPage } from '@/types/settings'

type InfoRouteProps = {
  params: Promise<{ slug: string }>
}

/** General information pages only; FAQ and payment & delivery have their own routes (never duplicated here). */
async function findPage(slug: string): Promise<InfoPage | null> {
  return hasDedicatedRoute(slug) ? null : getInfoPage(slug)
}

export async function generateMetadata(props: InfoRouteProps): Promise<Metadata> {
  const page = await findPage((await props.params).slug)
  return page ? { title: page.title, alternates: { canonical: infoPagePath(page.slug) } } : {}
}

export default async function InfoRoute(props: InfoRouteProps): Promise<React.JSX.Element> {
  const page = await findPage((await props.params).slug)
  if (!page) notFound()
  return <InfoPageView page={page} />
}
