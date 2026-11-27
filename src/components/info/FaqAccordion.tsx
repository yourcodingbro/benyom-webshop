import type React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/shadcn/accordion";
import { Skeleton } from "@/components/shadcn/skeleton";
import type { FaqEntry } from "@/types/settings";

type FaqAccordionProps = {
  /** Published entries of GYIK beállítások, in their manual order (dto/settings.ts getPublishedFaqs). */
  items: FaqEntry[];
};

/**
 * FAQ list on the shared shadcn Accordion: one answer open at a time, and the open one can be
 * closed again. Radix provides the heading/button semantics, aria-expanded and keyboard support
 * (Enter/Space toggle, arrow keys and Home/End move between questions).
 */
export function FaqAccordion(props: FaqAccordionProps): React.JSX.Element {
  if (props.items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground" role="status">
        Jelenleg nincs közzétett kérdés. Kérdésével forduljon hozzánk a Kapcsolat oldalon.
      </p>
    );
  }
  return (
    <Accordion type="single" collapsible className="rounded-xl border px-5">
      {props.items.map((item: FaqEntry) => (
        <AccordionItem key={item.id} value={`kerdes-${item.id}`}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent className="whitespace-pre-line">{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/** FaqAccordion placeholder: the bordered list of closed questions with their chevrons. */
export function FaqAccordionSkeleton(): React.JSX.Element {
  return (
    <div className="divide-y rounded-xl border px-5" aria-hidden="true">
      {['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/5', 'w-2/3'].map((width: string, index: number) => (
        <div key={index} className="flex items-center justify-between gap-4 py-4">
          <Skeleton className={`h-5 ${width}`} />
          <Skeleton className="size-4 shrink-0" />
        </div>
      ))}
    </div>
  )
}
