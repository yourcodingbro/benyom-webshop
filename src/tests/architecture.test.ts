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

describe('architecture boundaries', () => {
  it('sample data enters the app only through src/dto', () => {
    const offenders = sources.filter((file: string) => /from '@\/sample'|from '\.\.?\/sample'/.test(readFileSync(file, 'utf8')) && !rel(file).startsWith('dto/'))
    expect(offenders.map(rel)).toEqual([])
  })

  it('only DTO modules touch the sample runtime store', () => {
    const offenders = sources.filter((file: string) => readFileSync(file, 'utf8').includes("@/dto/sample-store") && !rel(file).startsWith('dto/') && rel(file) !== 'services/simulationService.ts')
    expect(offenders.map(rel)).toEqual([])
  })

  it('all notifications go through emailService.sendEmail; only emailService talks to Resend', () => {
    const pkg = readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    expect(pkg).not.toMatch(/"nodemailer"|"@sendgrid/)
    const resendImporters = sources.filter((file: string) => /from 'resend'/.test(readFileSync(file, 'utf8')))
    expect(resendImporters.map(rel)).toEqual(['services/emailService.ts'])
    expect(readFileSync(path.join(SRC, 'services', 'emailService.ts'), 'utf8')).toMatch(/^import 'server-only'/)
    const publicEmailVars = sources.filter((file: string) => /NEXT_PUBLIC_(RESEND|EMAIL_FROM|CONTACT_EMAIL)/.test(readFileSync(file, 'utf8')) && rel(file) !== 'config/email.ts')
    expect(publicEmailVars.map(rel)).toEqual([])
    const callers = sources.filter((file: string) => readFileSync(file, 'utf8').includes('emailService.sendEmail('))
    expect(callers.map(rel).sort()).toEqual(['services/contactService.ts', 'services/notificationService.ts'])
  })

  it('shadcn components live in src/components/shadcn and components/ui is not used', () => {
    expect(existsSync(path.join(SRC, 'components', 'ui'))).toBe(false)
    const config = JSON.parse(readFileSync(path.join(ROOT, 'components.json'), 'utf8')) as { aliases: { ui: string } }
    expect(config.aliases.ui).toBe('@/components/shadcn')
    expect(sources.some((file: string) => readFileSync(file, 'utf8').includes('@/components/ui'))).toBe(false)
  })

  it('client components never import server-only modules', () => {
    const clientFiles = sources.filter((file: string) => /^['"]use client['"]/.test(readFileSync(file, 'utf8').trimStart()))
    const offenders = clientFiles.filter((file: string) => /from '@\/(dto|services)\//.test(readFileSync(file, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })

  it('authored code avoids any and non-null assertions', () => {
    const authored = sources.filter((file: string) => !rel(file).startsWith('components/shadcn/') && !rel(file).startsWith('app/(payload)/') && rel(file) !== 'payload-types.ts')
    const offenders = authored.filter((file: string) => /:\s*any\b|as any\b|\w!\./.test(readFileSync(file, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })
})
