'use client'

import type React from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/shadcn/button'

type PendingSubmitButtonProps = Omit<React.ComponentProps<typeof Button>, 'type' | 'loading'> & {
  /** Hungarian label shown while the surrounding server-action form is submitting, e.g. "Küldés…". */
  pendingLabel: string
}

/**
 * Submit button for a server-action `<form>` rendered by a server component: while that form is pending it
 * shows the shared Button spinner with `pendingLabel` and is disabled, so it cannot be submitted twice.
 */
export function PendingSubmitButton(props: PendingSubmitButtonProps): React.JSX.Element {
  const { pendingLabel, children, ...rest } = props
  const { pending } = useFormStatus()
  return (
    <Button {...rest} type="submit" loading={pending}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
