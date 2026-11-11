import { SearchIcon } from 'lucide-react'
import type React from 'react'

import { Button } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'

type SearchFormProps = {
  id: string
  className?: string
  defaultValue?: string
}

/** Plain GET form: works without JavaScript and produces shareable /termekek?q= URLs. */
export function SearchForm(props: SearchFormProps): React.JSX.Element {
  return (
    <form action="/termekek" method="get" role="search" className={cn('relative', props.className)}>
      <label htmlFor={props.id} className="sr-only">
        Keresés név, márka, modell vagy cikkszám alapján
      </label>
      <input
        id={props.id}
        name="q"
        type="search"
        defaultValue={props.defaultValue}
        placeholder="Keresés (pl. iPhone 17, SAM-S26U)"
        className="h-10 w-full rounded-full border border-white/20 bg-white/10 pr-11 pl-4 text-sm text-white placeholder:text-white/60 focus:bg-white/15"
      />
      <Button type="submit" variant="ghostInverse" size="icon-xs" className="absolute top-1.5 right-1.5" aria-label="Keresés indítása">
        <SearchIcon aria-hidden="true" />
      </Button>
    </form>
  )
}
