import type React from 'react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/shadcn/accordion'
import type { FaqItem } from '@/types/settings'

type FaqAccordionProps = {
  items: FaqItem[]
}

/**
 * FAQ list on the shared shadcn Accordion: one answer open at a time, and the open one can be
 * closed again. Radix provides the heading/button semantics, aria-expanded and keyboard support
 * (Enter/Space toggle, arrow keys and Home/End move between questions).
 */
export function FaqAccordion(props: FaqAccordionProps): React.JSX.Element {
  return (
    <Accordion type="single" collapsible className="rounded-xl border px-5">
      {props.items.map((item: FaqItem, index: number) => (
        <AccordionItem key={item.question} value={`kerdes-${index}`}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
