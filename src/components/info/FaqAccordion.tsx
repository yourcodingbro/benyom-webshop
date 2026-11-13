import type React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/shadcn/accordion";
type FaqItem = {
  question: string;
  answer: string;
};

/** The FAQ content lives here, not in the store settings: the page needs no data fetching. */
const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Kell-e online fizetnem?",
    answer: "Nem. A fizetés átvételkor vagy kiszállításkor történik.",
  },
  {
    question: "Változhat-e a rendelésem ára?",
    answer: "Csak akkor, ha Ön egy árváltozási ajánlatot kifejezetten elfogad.",
  },
  {
    question: "Mi történik, ha nem válaszolok az árváltozási ajánlatra?",
    answer:
      "24 óra után emlékeztetőt küldünk; az emlékeztető elküldését követő újabb 24 óra elteltével a rendelés törlődik.",
  },
];

/**
 * FAQ list on the shared shadcn Accordion: one answer open at a time, and the open one can be
 * closed again. Radix provides the heading/button semantics, aria-expanded and keyboard support
 * (Enter/Space toggle, arrow keys and Home/End move between questions).
 */
export function FaqAccordion(): React.JSX.Element {
  return (
    <Accordion type="single" collapsible className="rounded-xl border px-5">
      {FAQ_ITEMS.map((item: FaqItem, index: number) => (
        <AccordionItem key={item.question} value={`kerdes-${index}`}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
