import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { FaqAccordion } from '@/components/info/FaqAccordion'
import { getInfoPage } from '@/dto/settings'

type InfoPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: InfoPageProps): Promise<Metadata> {
  const page = await getInfoPage((await props.params).slug)
  return page ? { title: page.title, alternates: { canonical: `/oldal/${page.slug}` } } : {}
}

export default async function InfoPage(props: InfoPageProps): Promise<React.JSX.Element> {
  const page = await getInfoPage((await props.params).slug)
  if (!page) notFound()
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ label: page.title }]} />
      <h1 className="text-3xl font-bold">{page.title}</h1>
      {page.paragraphs.length > 0 ? (
        <div className="mt-6 space-y-4 leading-relaxed">
          {page.paragraphs.map((paragraph: string) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {page.faq?.length ? (
        <div className="mt-6">
          <FaqAccordion items={page.faq} />
        </div>
      ) : null}
    </div>
  )
}
