import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '..')
const ROOT = path.resolve(SRC, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

const sources = files(SRC).filter((file: string) => !file.includes(`${path.sep}tests${path.sep}`))
const rel = (file: string): string => path.relative(SRC, file).split(path.sep).join('/')
const read = (file: string): string => readFileSync(file, 'utf8')
const isClient = (file: string): boolean => /^['"]use client['"]/.test(read(file).trimStart())

describe('architecture boundaries', () => {
  it('the original dataset is migration input only: never read at runtime, no sample fallback', () => {
    const seedImporters = sources.filter((file: string) => read(file).includes("from '@/seed/") && !rel(file).startsWith('seed/') && !rel(file).startsWith('scripts/'))
    expect(seedImporters.map(rel)).toEqual([])
    const fallbacks = sources.filter((file: string) => /sample-store|sampleStore\(|isSampleContent|isSampleCheckoutEnabled|ENABLE_SAMPLE_DEV_TOOLS/.test(read(file)))
    expect(fallbacks.map(rel)).toEqual([])
    expect(existsSync(path.join(SRC, 'sample.ts'))).toBe(false)
  })

  it('only the DTO layer reaches the database (Payload Local API); no parallel database client', () => {
    const payloadClientUsers = sources.filter((file: string) => read(file).includes("from '@/dto/payload'") && !rel(file).startsWith('dto/'))
    expect(payloadClientUsers.map(rel)).toEqual([])
    const getPayloadCallers = sources.filter((file: string) => read(file).includes('getPayload('))
    expect(getPayloadCallers.map(rel).sort()).toEqual(['dto/payload.ts', 'scripts/import-initial-data.ts'])
    const pkg = read(path.join(ROOT, 'package.json'))
    expect(pkg).not.toMatch(/"@supabase\/supabase-js"|"postgres"|"pg-promise"/)
    const storefront = sources.filter((file: string) => (rel(file).startsWith('app/(frontend)/') || rel(file).startsWith('components/')) && !rel(file).startsWith('components/admin/'))
    expect(storefront.filter((file: string) => /from 'payload'|@payloadcms\/db-postgres/.test(read(file))).map(rel)).toEqual([])
  })

  it('privileged configuration is server-only (no NEXT_PUBLIC_ secrets)', () => {
    const offenders = sources.filter((file: string) => /NEXT_PUBLIC_(DATABASE|PAYLOAD|APP_SIGNING|SUPABASE_S3|CRON|RESEND)/.test(read(file)) && rel(file) !== 'config/env.ts' && rel(file) !== 'config/email.ts')
    expect(offenders.map(rel)).toEqual([])
    const clientConfigImporters = sources.filter((file: string) => isClient(file) && /from '@\/config\/(env|email|runtime)'/.test(read(file)))
    expect(clientConfigImporters.map(rel)).toEqual([])
  })

  it('all notifications go through emailService.sendEmail or persisted jobs; only emailService talks to Resend', () => {
    const pkg = read(path.join(ROOT, 'package.json'))
    expect(pkg).not.toMatch(/"nodemailer"|"@sendgrid/)
    const resendImporters = sources.filter((file: string) => /from 'resend'/.test(read(file)))
    expect(resendImporters.map(rel)).toEqual(['services/emailService.ts'])
    expect(read(path.join(SRC, 'services', 'emailService.ts'))).toMatch(/^import 'server-only'/)
    const callers = sources.filter((file: string) => read(file).includes('emailService.sendEmail('))
    expect(callers.map(rel).sort()).toEqual(['services/contactService.ts', 'services/notificationService.ts'])
  })

  it('shadcn components live in src/components/shadcn and components/ui is not used', () => {
    expect(existsSync(path.join(SRC, 'components', 'ui'))).toBe(false)
    const config = JSON.parse(read(path.join(ROOT, 'components.json'))) as { aliases: { ui: string } }
    expect(config.aliases.ui).toBe('@/components/shadcn')
    expect(sources.some((file: string) => read(file).includes('@/components/ui'))).toBe(false)
  })

  it('client components never import server-only modules', () => {
    const offenders = sources.filter((file: string) => isClient(file) && /from '@\/(dto|services)\//.test(read(file)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('authored code avoids any and non-null assertions', () => {
    const authored = sources.filter((file: string) => !rel(file).startsWith('components/shadcn/') && !rel(file).startsWith('app/(payload)/') && !rel(file).startsWith('migrations/') && rel(file) !== 'payload-types.ts')
    const offenders = authored.filter((file: string) => /:\s*any\b|as any\b|\w!\./.test(read(file)))
    expect(offenders.map(rel)).toEqual([])
  })
})
