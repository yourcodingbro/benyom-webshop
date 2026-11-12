"use client";

import { ArrowUpDownIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import type React from "react";
import { useId } from "react";

import { Button } from "@/components/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { SORT_LABELS } from "@/config/labels";
import { DEFAULT_PRODUCT_SORT, SEARCH_DEBOUNCE_MS } from "@/config/shop";
import { useDebouncedSearchParam } from "@/hooks/useDebouncedSearchParam";
import { useListingTransition } from "@/hooks/useListingTransition";
import { useListingUrl } from "@/hooks/useListingUrl";
import type { ProductSort } from "@/types/catalog";

type ListingToolbarProps = {
  /** Listing route the form submits to without JavaScript. */
  action: string;
  sort: ProductSort;
  /** Other active filters as [name, value] pairs, kept by the no-JS form submission. */
  preservedParams: [string, string][];
};

const SEARCH_PARAM = "q";
const SORT_PARAM = "rendezes";

/**
 * Full-width search above the grid and sorting right-aligned below it. With JavaScript, search
 * applies ~300 ms after typing stops and sorting applies on selection; without it, this is a GET form.
 */
export function ListingToolbar(props: ListingToolbarProps): React.JSX.Element {
  const id = useId();
  const { isPending } = useListingTransition();
  const { update } = useListingUrl();
  const search = useDebouncedSearchParam({
    param: SEARCH_PARAM,
    delayMs: SEARCH_DEBOUNCE_MS,
  });

  const changeSort = (sort: string): void => {
    // An explicit sort choice is a history entry (unlike keystrokes).
    update({
      history: "push",
      mutate: (query: URLSearchParams) => {
        if (sort === DEFAULT_PRODUCT_SORT) query.delete(SORT_PARAM);
        else query.set(SORT_PARAM, sort);
      },
    });
  };

  const busy = isPending || search.debouncing;
  return (
    <form
      action={props.action}
      method="get"
      role="search"
      aria-label="Keresés és rendezés"
      className="mb-5 w-full space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        search.flush();
      }}
    >
      {props.preservedParams.map(([name, value]) => (
        <input
          key={`${name}=${value}`}
          type="hidden"
          name={name}
          value={value}
        />
      ))}
      <div className="w-full">
        <label htmlFor={`${id}-kereses`} className="sr-only">
          Keresés a termékek között
        </label>
        <div className="relative w-full">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={`${id}-kereses`}
            name={SEARCH_PARAM}
            type="search"
            value={search.value}
            onChange={(event) => search.setValue(event.target.value)}
            placeholder="Keresés név, márka, modell vagy cikkszám alapján"
            autoComplete="off"
            maxLength={100}
            aria-describedby={`${id}-kereses-allapot`}
            className="h-11 w-full min-w-0 rounded-full border border-input bg-white pr-11 pl-11 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground hover:border-ink focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          />
          {busy ? (
            <Loader2Icon
              className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : search.value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              aria-label="Keresés törlése"
              onClick={() => search.setValue("")}
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <span
          id={`${id}-kereses-allapot`}
          className="sr-only"
          aria-live="polite"
        >
          {busy ? "Keresés folyamatban…" : ""}
        </span>
      </div>
      <div className="flex w-full items-center justify-end gap-2">
        <label
          id={`${id}-rendezes-cimke`}
          htmlFor={`${id}-rendezes`}
          className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap"
        >
          <ArrowUpDownIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Rendezés
        </label>
        <Select
          key={props.sort}
          name={SORT_PARAM}
          defaultValue={props.sort}
          onValueChange={changeSort}
        >
          <SelectTrigger
            id={`${id}-rendezes`}
            aria-labelledby={`${id}-rendezes-cimke ${id}-rendezes`}
            className="w-56 max-w-[60%]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {(Object.keys(SORT_LABELS) as ProductSort[]).map(
              (sort: ProductSort) => (
                <SelectItem key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>
      <noscript>
        <Button type="submit" variant="outline">
          Alkalmaz
        </Button>
      </noscript>
    </form>
  );
}
