const HEX_PATTERN: RegExp = /^#[0-9a-fA-F]{6}$/

/**
 * Normalizes a product color to uppercase `#RRGGBB`. Returns null for anything else.
 * The same rule is used by sample data, Payload fields and CSV import.
 */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return HEX_PATTERN.test(trimmed) ? trimmed.toUpperCase() : null
}

/** Media path segment for a color: lowercase hex without `#`, e.g. `000000`. */
export function hexToPathSegment(hex: string): string {
  const normalized = normalizeHexColor(hex)
  if (!normalized) throw new RangeError('Érvénytelen HEX színkód')
  return normalized.slice(1).toLowerCase()
}

/** Relative luminance (WCAG). */
export function hexLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return 0
  const channel = (offset: number): number => {
    const value = parseInt(normalized.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Light swatches need a visible border against white backgrounds. */
export function isLightColor(hex: string): boolean {
  return hexLuminance(hex) > 0.6
}

export function describeColor(hex: string, label: string | null): string {
  return label ? `${label} (${hex})` : hex
}
