'use client'

import { CheckCircle2Icon, ClockIcon, InfoIcon, SendIcon } from 'lucide-react'
import Link from 'next/link'
import type React from 'react'
import { useActionState, useEffect, useRef, useState } from 'react'

import { type ContactFormState, contactFormAction } from '@/app/(frontend)/kapcsolat/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Button } from '@/components/shadcn/button'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { CONTACT_LIMITS, contactFieldsSchema } from '@/schemas/contact'
import type { FieldErrors } from '@/types/common'
import { Skeleton } from '@/components/shadcn/skeleton'

type ContactFormProps = {
  /** Signed render time issued by the server (anti-spam). */
  formToken: string
}

type FieldsState = { name: string; email: string; subject: string; message: string }

type FieldProps = {
  id: keyof FieldsState
  label: string
  value: string
  error: string | undefined
  maxLength: number
  onChange: (value: string) => void
  disabled: boolean
  type?: string
  autoComplete?: string
  multiline?: boolean
}

const EMPTY: FieldsState = { name: '', email: '', subject: '', message: '' }
const INITIAL: ContactFormState = { result: null, values: null, submissionKey: null }

function Field(props: FieldProps): React.JSX.Element {
  const inputId = `kapcsolat-${props.id}`
  const errorId = `${inputId}-hiba`
  const shared = {
    id: inputId,
    name: props.id,
    value: props.value,
    maxLength: props.maxLength,
    required: true,
    // readOnly (not disabled) while sending: the value stays visible and is still part of the form data.
    readOnly: props.disabled,
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

/** What the visitor sees after a submit; never claims an email was sent unless the provider accepted it. */
function ResultAlert(props: { state: ContactFormState; clientError: string | null }): React.JSX.Element | null {
  const result = props.state.result
  if (props.clientError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Az üzenet nem lett elküldve</AlertTitle>
        <AlertDescription>{props.clientError}</AlertDescription>
      </Alert>
    )
  }
  if (!result) return null
  if (!result.ok) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{result.stored ? 'Üzenetét rögzítettük, de a továbbítás nem sikerült' : 'Az üzenet nem lett elküldve'}</AlertTitle>
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    )
  }
  if (result.delivery === 'sent') {
    return (
      <Alert>
        <CheckCircle2Icon aria-hidden="true" />
        <AlertTitle>Köszönjük, üzenetét elküldtük.</AlertTitle>
        <AlertDescription>Hamarosan válaszolunk a megadott e-mail-címre.</AlertDescription>
      </Alert>
    )
  }
  if (result.delivery === 'queued') {
    return (
      <Alert>
        <ClockIcon aria-hidden="true" />
        <AlertTitle>Üzenetét rögzítettük, a továbbítás folyamatban.</AlertTitle>
        <AlertDescription>A bolt értesítése késik, automatikusan újrapróbáljuk. Nem kell újra elküldenie, és nem fog kétszer megérkezni.</AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert>
      <InfoIcon aria-hidden="true" />
      <AlertTitle>Üzenetét rögzítettük – e-mail nem ment ki.</AlertTitle>
      <AlertDescription>Naplózó mód (EMAIL_MODE=log): az értesítés csak az e-mail naplóban jelenik meg.</AlertDescription>
    </Alert>
  )
}

/**
 * Contact form. Client validation gives quick feedback; the server validates again and owns the recipient.
 * The form posts through its server action, so it also works (and never leaks data via GET) before
 * hydration. While sending, the button shows "Küldés…" and the fields stay visible but locked.
 */
export function ContactForm(props: ContactFormProps): React.JSX.Element {
  // Without JavaScript (or before hydration) the browser posts the form to this action natively and the
  // server renders the result; with JavaScript the submit handler calls the action directly (below).
  const [actionState, formAction] = useActionState(contactFormAction, INITIAL)
  const [clientState, setClientState] = useState<ContactFormState | null>(null)
  const state = clientState ?? actionState
  const [pending, setPending] = useState<boolean>(false)
  const [fields, setFields] = useState<FieldsState>(actionState.values ?? EMPTY)
  const [privacy, setPrivacy] = useState<boolean>(false)
  const [website, setWebsite] = useState<string>('')
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  // Synchronous guard: a second click can arrive before React re-renders with the pending state.
  const dispatched = useRef<boolean>(false)

  // Move focus to the first invalid field, or to the result, after each server answer.
  useEffect(() => {
    if (!state.result) return
    requestAnimationFrame(() => {
      const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (invalid) invalid.focus()
      else statusRef.current?.focus()
    })
  }, [state])

  const errors: FieldErrors = clientErrors ?? (state.result && !state.result.ok ? state.result.fieldErrors : {})
  const set = (field: keyof FieldsState) => (value: string): void => setFields((current) => ({ ...current, [field]: value }))

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    // A second submit while sending is ignored.
    if (dispatched.current) return
    const parsed = contactFieldsSchema.safeParse({ ...fields, privacyAccepted: privacy })
    if (!parsed.success) {
      const found: FieldErrors = {}
      for (const issue of parsed.error.issues) found[issue.path.map(String).join('.')] ??= issue.message
      setClientErrors(found)
      setClientError('Kérjük, javítsa a megjelölt mezőket.')
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setClientErrors(null)
    setClientError(null)
    dispatched.current = true
    setPending(true)
    const data = new FormData(event.currentTarget)
    try {
      const next = await contactFormAction(state, data)
      setClientState(next)
      // Success clears the form; after a failure every entered value (and the consent) stays.
      if (next.result?.ok) {
        setFields(EMPTY)
        setPrivacy(false)
      }
    } catch {
      setClientState({ result: { ok: false, stored: false, fieldErrors: {}, message: 'A kapcsolat megszakadt, az üzenet nem lett elküldve. Ellenőrizze az internetkapcsolatot, majd próbálja újra; a beírt adatok megmaradtak.' }, values: null, submissionKey: state.submissionKey })
    } finally {
      dispatched.current = false
      setPending(false)
    }
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={(event) => void submit(event)} noValidate className="space-y-5" aria-describedby="kapcsolat-allapot" aria-busy={pending || undefined}>
      <input type="hidden" name="formToken" value={props.formToken} />
      {/* Empty: the server issues a key; a failed attempt returns it, so a retry is never stored twice. */}
      <input type="hidden" name="submissionKey" value={state.submissionKey ?? ''} />
      <div id="kapcsolat-allapot" ref={statusRef} tabIndex={-1} className="outline-none" aria-live="polite">
        {pending ? <span className="sr-only">Üzenet küldése folyamatban…</span> : <ResultAlert state={state} clientError={clientError} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Név" value={fields.name} error={errors.name} maxLength={CONTACT_LIMITS.name} autoComplete="name" onChange={set('name')} disabled={pending} />
        <Field id="email" label="E-mail-cím" type="email" value={fields.email} error={errors.email} maxLength={CONTACT_LIMITS.email} autoComplete="email" onChange={set('email')} disabled={pending} />
      </div>
      <Field id="subject" label="Tárgy" value={fields.subject} error={errors.subject} maxLength={CONTACT_LIMITS.subject} onChange={set('subject')} disabled={pending} />
      <Field id="message" label="Üzenet" value={fields.message} error={errors.message} maxLength={CONTACT_LIMITS.message} onChange={set('message')} disabled={pending} multiline />

      {/*
        Honeypot: invisible to people and assistive technology; bots that fill it are refused. Deliberately
        not named like anything a browser or password manager autofills ("website", "url", "email", …):
        an autofilled honeypot used to turn real messages into silently dropped "spam".
      */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="kapcsolat-hp">Ezt a mezőt hagyja üresen</label>
        <input
          id="kapcsolat-hp"
          name="hp_kapcsolat"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <Checkbox
            id="kapcsolat-adatvedelem"
            name="privacyAccepted"
            value="on"
            checked={privacy}
            disabled={pending}
            onCheckedChange={(value) => setPrivacy(value === true)}
            aria-invalid={errors.privacyAccepted ? true : undefined}
            aria-describedby={errors.privacyAccepted ? 'kapcsolat-adatvedelem-hiba' : undefined}
            className="mt-0.5"
          />
          <Label htmlFor="kapcsolat-adatvedelem" className="block leading-snug font-normal">
            Megismertem az{' '}
            <Link href="/info/adatvedelem" target="_blank" className="underline">
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

      <Button type="submit" size="lg" loading={pending} aria-busy={pending || undefined}>
        {pending ? null : <SendIcon aria-hidden="true" />}
        {pending ? 'Küldés…' : 'Üzenet küldése'}
      </Button>
    </form>
  )
}

/** ContactForm placeholder: name / email row, subject, message area with counter, consent and the send button. */
export function ContactFormSkeleton(): React.JSX.Element {
  const field = (height: string): React.JSX.Element => (
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className={`${height} w-full`} />
    </div>
  )
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('h-10')}
        {field('h-10')}
      </div>
      {field('h-10')}
      {field('h-16')}
      <div className="flex items-start gap-2">
        <Skeleton className="mt-0.5 size-4 shrink-0" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-11 w-44 rounded-full" />
    </div>
  )
}
