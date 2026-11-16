'use client'

import { useRouter } from 'next/navigation'
import type React from 'react'
import { useEffect } from 'react'

type ClickableListRowsProps = { children?: React.ReactNode }

/** Anything that has its own action; a click on it never also opens the record. */
const INTERACTIVE: string = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * The record link Payload renders in the row (first column): the current list path plus one segment.
 * Matched by path rather than `data-id`, which orderable (drag-and-drop) lists do not render.
 */
function recordLink(row: HTMLTableRowElement): HTMLAnchorElement | null {
  const list = window.location.pathname.replace(/\/+$/, '')
  const links = Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href]'))
  return links.find((link) => link.origin === window.location.origin && link.pathname.startsWith(`${list}/`) && !link.pathname.slice(list.length + 1).includes('/')) ?? null
}

/** The list-view row of a plain click on a non-interactive area, or null. */
function rowFor(event: MouseEvent): HTMLTableRowElement | null {
  const target = event.target instanceof Element ? event.target : null
  if (!target || target.closest(INTERACTIVE)) return null
  const row = target.closest<HTMLTableRowElement>('.collection-list tbody tr')
  // Lists inside drawers (relationship pickers) keep their own selection behaviour.
  if (!row || row.closest('.list-drawer, [class*="drawer"]')) return null
  // Selecting text (to copy it) must not navigate.
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed && selection.toString().trim() && row.contains(selection.anchorNode)) return null
  return row
}

/**
 * Admin provider: in every collection list, a click on a row's empty or plain-text area opens that
 * record (the same URL as Payload's own first-column link, so access rules and read-only detail views
 * apply unchanged). Ctrl/⌘/Shift-click and middle-click open it in a new tab, like the link. Controls
 * (checkboxes, bulk actions, buttons, links, drag handles, inputs) keep their own action. Keyboard
 * users keep the native link in the first column; rows get no extra tab stops or roles.
 */
export function ClickableListRows(props: ClickableListRowsProps): React.JSX.Element {
  const router = useRouter()

  useEffect(() => {
    const open = (event: MouseEvent, newTab: boolean): void => {
      if (event.defaultPrevented) return
      const row = rowFor(event)
      const link = row ? recordLink(row) : null
      if (!link) return
      if (newTab) window.open(link.href, '_blank', 'noopener')
      else router.push(link.pathname + link.search)
    }
    const onClick = (event: MouseEvent): void => {
      if (event.button === 0) open(event, event.metaKey || event.ctrlKey || event.shiftKey)
    }
    const onAuxClick = (event: MouseEvent): void => {
      if (event.button === 1) open(event, true)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('auxclick', onAuxClick)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('auxclick', onAuxClick)
    }
  }, [router])

  return (
    <>
      <style>{'.collection-list tbody tr { cursor: pointer; } .collection-list tbody tr:hover { background: var(--theme-elevation-50); }'}</style>
      {props.children}
    </>
  )
}
