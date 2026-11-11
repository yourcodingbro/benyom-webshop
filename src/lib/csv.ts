export type ParsedCsv = {
  header: string[]
  rows: string[][]
}

/**
 * Minimal RFC 4180 parser: quoted fields, escaped quotes ("") and CRLF/LF.
 * Strips a UTF-8 BOM. The delimiter is configurable (default `;` for Hungarian Excel).
 */
export function parseCsv(input: string, delimiter: string = ';'): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
    } else if (char === delimiter) {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new SyntaxError('Lezáratlan idézőjel a CSV-ben')
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  const nonEmpty = records.filter((row: string[]) => row.some((cell: string) => cell.trim() !== ''))
  const [header = [], ...rows] = nonEmpty
  return { header: header.map((cell: string) => cell.trim()), rows }
}
