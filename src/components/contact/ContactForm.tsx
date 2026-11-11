'use client'

import { CheckCircle2Icon, SendIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'
import { useRef, useState } from 'react'

import { submitContactAction } from '@/app/(frontend)/kapcsolat/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Button } from '@/components/shadcn/button'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { CONTACT_LIMITS, contactFieldsSchema } from '@/schemas/contact'
import type { FieldErrors } from '@/types/common'

type ContactFormProps = {
  /** Signed render time issued by the server (anti-spam). */
  formToken: string
}

type FieldsState = { name: string; email: string; subject: string; message: string }

type Status = { kind: 'idle' } | { kind: 'success'; delivery: 'sent' | 'simulated' } | { kind: 'error'; message: string }

type FieldProps = {
  id: keyof FieldsState
  label: string
  value: string
  error: string | undefined
  maxLength: number
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  multiline?: boolean
}

const EMPTY: FieldsState = { name: '', email: '', subject: '', message: '' }

function Field(props: FieldProps): React.JSX.Element {
  const inputId = `kapcsolat-${props.id}`
  const errorId = `${inputId}-hiba`
  const shared = {
    id: inputId,
    name: props.id,
    value: props.value,
    maxLength: props.maxLength,
    required: true,
    'aria-invalid': props.error ? true : undefined,
    'aria-describedby': props.error ? errorId : undefined,
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{props.label}</Label>
      {props.multiline ? (
        <Textarea {...shared} rows={6} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <Input {...shared} type={props.type ?? 'text'} autoComplete={props.autoComplete} onChange={(event) => props.onChange(event.target.value)} />
      )}
      {props.multiline ? (
        <p className="text-right text-xs text-muted-foreground">
          {props.value.length}/{props.maxLength}
        </p>
      ) : null}
      {props.error ? (
        <p id={errorId} className="text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

/** Contact form: client validation for quick feedback; the server validates again and owns the recipient. */
export function ContactForm(props: ContactFormProps): React.JSX.Element {
  const [fields, setFields] = useState<FieldsState>(EMPTY)
  const [privacy, setPrivacy] = useState<boolean>(false)
  const [website, setWebsite] = useState<string>('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [pending, setPending] = useState<boolean>(false)
  const pendingRef = useRef<boolean>(false)
  // Reused for retries so a resubmission is never stored or forwarded twice.
  const submissionKey = useRef<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  const set = (field: keyof FieldsState) => (value: string): void => setFields({ ...fields, [field]: value })

  const focusFirstInvalid = (): void => {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (pendingRef.current) return
    const parsed = contactFieldsSchema.safeParse({ ...fields, privacyAccepted: privacy })
    if (!parsed.success) {
      const found: FieldErrors = {}
      for (const issue of parsed.error.issues) found[issue.path.map(String).join('.')] ??= issue.message
      setErrors(found)
      setStatus({ kind: 'error', message: 'Kérjük, javítsa a megjelölt mezőket.' })
      focusFirstInvalid()
      return
    }
    setErrors({})
    pendingRef.current = true
    setPending(true)
    submissionKey.current ??= crypto.randomUUID()
    const result = await submitContactAction({ ...parsed.data, submissionKey: submissionKey.current, formToken: props.formToken, website }).catch(() => null)
    pendingRef.current = false
    setPending(false)
    if (!result) {
      setStatus({ kind: 'error', message: 'A kapcsolat megszakadt. Kérjük, próbálja újra.' })
    } else if (!result.ok) {
      setErrors(result.fieldErrors)
      setStatus({ kind: 'error', message: result.message })
      if (Object.keys(result.fieldErrors).length > 0) focusFirstInvalid()
    } else {
      setStatus({ kind: 'success', delivery: result.delivery })
      setFields(EMPTY)
      setPrivacy(false)
      submissionKey.current = null
    }
    requestAnimationFrame(() => statusRef.current?.focus())
  }

  return (
    <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-5" aria-describedby="kapcsolat-allapot">
      <div id="kapcsolat-allapot" ref={statusRef} tabIndex={-1} className="outline-none" aria-live="polite">
        {status.kind === 'success' ? (
          <Alert>
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Köszönjük, üzenetét rögzítettük.</AlertTitle>
            <AlertDescription>
              {status.delivery === 'simulated'
                ? 'Naplózó mód: e-mail nem került kiküldésre – az értesítés csak a fejlesztői e-mail naplóban jelenik meg.'
                : 'Hamarosan válaszolunk a megadott e-mail-címre.'}
            </AlertDescription>
          </Alert>
        ) : null}
        {status.kind === 'error' ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Az üzenet nem lett elküldve</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Név" value={fields.name} error={errors.name} maxLength={CONTACT_LIMITS.name} autoComplete="name" onChange={set('name')} />
        <Field id="email" label="E-mail-cím" type="email" value={fields.email} error={errors.email} maxLength={CONTACT_LIMITS.email} autoComplete="email" onChange={set('email')} />
      </div>
      <Field id="subject" label="Tárgy" value={fields.subject} error={errors.subject} maxLength={CONTACT_LIMITS.subject} onChange={set('subject')} />
      <Field id="message" label="Üzenet" value={fields.message} error={errors.message} maxLength={CONTACT_LIMITS.message} onChange={set('message')} multiline />

      {/* Honeypot: invisible to people and assistive technology; bots that fill it are ignored. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="kapcsolat-weboldal">Weboldal</label>
        <input id="kapcsolat-weboldal" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <Checkbox
            id="kapcsolat-adatvedelem"
            checked={privacy}
            onCheckedChange={(value) => setPrivacy(value === true)}
            aria-invalid={errors.privacyAccepted ? true : undefined}
            aria-describedby={errors.privacyAccepted ? 'kapcsolat-adatvedelem-hiba' : undefined}
            className="mt-0.5"
          />
          <Label htmlFor="kapcsolat-adatvedelem" className="block leading-snug font-normal">
            Megismertem az{' '}
            <Link href="/oldal/adatvedelem" target="_blank" className="underline">
              Adatkezelési tájékoztatót
            </Link>
            , és hozzájárulok, hogy üzenetem megválaszolásához adataimat kezeljék.
          </Label>
        </div>
        {errors.privacyAccepted ? (
          <p id="kapcsolat-adatvedelem-hiba" className="text-sm text-destructive">
            {errors.privacyAccepted}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" loading={pending}>
        {pending ? null : <SendIcon aria-hidden="true" />}
        {pending ? 'Küldés…' : 'Üzenet küldése'}
      </Button>
    </form>
  )
}
