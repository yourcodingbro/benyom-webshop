'use client'

import { SpinnerIcon } from '@payloadcms/ui/icons/Spinner'
import type React from 'react'

type BusyButtonProps = {
  busy: boolean
  /** Specific Hungarian progress label, e.g. "Küldés…". */
  busyLabel: string
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary'
  size?: 'medium' | 'small'
  disabled?: boolean
  /** Other actions of the same component are running: not clickable, but no spinner here. */
  blocked?: boolean
  describedBy?: string
}

/**
 * Payload-styled button (native `btn` classes) with Payload's spinner icon and a specific label while
 * its action runs. Disabled and `aria-busy` while pending, so it cannot be submitted twice.
 */
export function BusyButton(props: BusyButtonProps): React.JSX.Element {
  return (
    <button
      type={props.type ?? 'button'}
      className={`btn btn--style-${props.variant ?? 'secondary'} btn--size-${props.size ?? 'medium'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}
      disabled={props.busy || props.blocked || props.disabled}
      aria-busy={props.busy || undefined}
      aria-describedby={props.describedBy}
      onClick={props.onClick}
    >
      {props.busy ? (
        <>
          <SpinnerIcon size="sm" />
          {props.busyLabel}
        </>
      ) : (
        props.children
      )}
    </button>
  )
}

type ActionStatusProps = {
  /** ok: success (polite status); otherwise an error or warning (assertive alert). */
  message: { ok: boolean; text: string } | null
  /** Announced (visually hidden) while the action runs. */
  pendingText?: string | null
}

/** Live region for the outcome of a custom action; announces progress too. */
export function ActionStatus(props: ActionStatusProps): React.JSX.Element | null {
  if (props.pendingText) {
    return (
      <span role="status" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {props.pendingText}
      </span>
    )
  }
  if (!props.message) return null
  return (
    <p role={props.message.ok ? 'status' : 'alert'} style={{ margin: '8px 0 0', whiteSpace: 'pre-line', color: props.message.ok ? 'var(--theme-success-500)' : 'var(--theme-error-500)' }}>
      {props.message.text}
    </p>
  )
}
