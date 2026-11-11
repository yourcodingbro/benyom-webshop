'use client'

import type React from 'react'
import { useActionState } from 'react'

import { type CsvImportState, csvImportAction } from '@/app/(frontend)/fejlesztes/actions'
import { Button } from '@/components/shadcn/button'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import type { ImportCounts } from '@/types/import'

type CountsRowProps = {
  label: string
  counts: ImportCounts
}

function CountsRow(props: CountsRowProps): React.JSX.Element {
  return (
    <tr className="border-b">
      <th className="py-1 pr-4 text-left">{props.label}</th>
      <td className="py-1 pr-4">{props.counts.created}</td>
      <td className="py-1 pr-4">{props.counts.updated}</td>
      <td className="py-1 pr-4">{props.counts.skipped}</td>
      <td className="py-1">{props.counts.failed}</td>
    </tr>
  )
}

const INITIAL: CsvImportState = { report: null, error: null }

/** Development-only CSV import with dry-run preview. */
export function CsvImportForm(): React.JSX.Element {
  const [state, action, pending] = useActionState(csvImportAction, INITIAL)
  const report = state.report
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="csv-fajl">CSV-fájl (UTF-8, pontosvessző elválasztó)</Label>
          <input id="csv-fajl" name="file" type="file" accept=".csv,text/csv" className="block text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-szoveg">…vagy illessze be a tartalmat</Label>
          <Textarea id="csv-szoveg" name="csv" rows={6} className="font-mono text-xs" placeholder="product_id;sku;price_huf" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="mode" value="preview" variant="outline" disabled={pending}>
            Előnézet (dry run)
          </Button>
          <Button type="submit" name="mode" value="apply" disabled={pending}>
            Importálás
          </Button>
        </div>
      </form>
      <div aria-live="polite">
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {report ? (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">
              {report.dryRun ? 'Előnézet – semmi nem változott.' : 'Import lefutott.'} {report.rowCount} sor.
              {report.brandsCreated.length ? ` Új márkák: ${report.brandsCreated.join(', ')}.` : ''}
              {report.categoriesCreated.length ? ` Új kategóriák: ${report.categoriesCreated.join(', ')}.` : ''}
            </p>
            <table>
              <thead>
                <tr className="border-b text-left">
                  <th className="pr-4" />
                  <th className="pr-4">Létrehozva</th>
                  <th className="pr-4">Frissítve</th>
                  <th className="pr-4">Kihagyva</th>
                  <th>Hibás</th>
                </tr>
              </thead>
              <tbody>
                <CountsRow label="Termékek" counts={report.products} />
                <CountsRow label="Változatok" counts={report.variants} />
              </tbody>
            </table>
            {report.errors.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-destructive">
                {report.errors.map((error, index: number) => (
                  <li key={`${error.row}-${index}`}>
                    {error.row}. sor{error.column ? ` (${error.column})` : ''}: {error.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
