import type { VariantDimension } from '@/lib/variant-selection'

/*
 * Layout of product cards in a product grid. A plain module (not 'use client'): server pages import these class
 * strings for their grid and list items, and a value exported from a client component would reach them only as a
 * client reference, not as the string.
 */

/**
 * The card's rows, shared through CSS subgrid with every card of the same grid row: a part sits in the same row of
 * each card, so colours, storage options, quantity and "Kosárba" line up even when a card has fewer variant options or
 * a longer name (a missing part leaves its row empty, and the row takes its height from the other cards).
 */
export const CARD_ROWS = { image: 1, brand: 2, title: 3, price: 4, colorHex: 5, storageGb: 6, caseSizeMm: 7, ramGb: 8, quantity: 9, button: 10, feedback: 11 } as const
export const DIMENSION_ROWS: Record<VariantDimension, number> = { colorHex: CARD_ROWS.colorHex, storageGb: CARD_ROWS.storageGb, caseSizeMm: CARD_ROWS.caseSizeMm, ramGb: CARD_ROWS.ramGb }

/**
 * Classes for every wrapper between the product grid and the card (list item, Reveal): each spans the card's rows
 * and passes the parent rows down (subgrid). Inside a card the rows have no gap; parts keep their own spacing.
 */
export const PRODUCT_CARD_CELL: string = 'row-span-11 grid grid-rows-subgrid gap-y-0'

/**
 * The product grid itself: column gaps only. A row gap would be repeated between every shared card row (also the empty
 * ones), so the space between card rows comes from PRODUCT_GRID_ITEM's bottom padding instead.
 */
export const PRODUCT_GRID_GAP: string = 'gap-x-3 gap-y-0 sm:gap-x-4'

/** The list item of a product card: the subgrid cell plus the space below the card. */
export const PRODUCT_GRID_ITEM: string = `${PRODUCT_CARD_CELL} pb-3 sm:pb-4`
