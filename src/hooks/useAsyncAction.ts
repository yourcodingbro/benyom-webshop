'use client'

import { useCallback, useRef, useState } from 'react'

type UseAsyncActionResult = {
  /** Which action is running (null when idle); lets one component show the right busy label. */
  pending: string | null
  /** Runs `work` unless an action is already pending; repeated clicks while pending are ignored. */
  run: (key: string, work: () => Promise<void>) => Promise<void>
}

/**
 * Pending state for a custom admin action. The guard is a ref, so a double click before React re-renders
 * still cannot submit twice; `pending` is cleared after success and after failure.
 */
export function useAsyncAction(): UseAsyncActionResult {
  const running = useRef<boolean>(false)
  const [pending, setPending] = useState<string | null>(null)
  const run = useCallback(async (key: string, work: () => Promise<void>): Promise<void> => {
    if (running.current) return
    running.current = true
    setPending(key)
    try {
      await work()
    } finally {
      running.current = false
      setPending(null)
    }
  }, [])
  return { pending, run }
}
