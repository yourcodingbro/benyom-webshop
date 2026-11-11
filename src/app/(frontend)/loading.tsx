import type React from 'react'

export default function Loading(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">Betöltés…</span>
      <div className="h-9 w-64 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_: unknown, index: number) => (
          <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  )
}
