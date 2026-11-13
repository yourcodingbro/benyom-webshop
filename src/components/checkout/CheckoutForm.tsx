'use client'

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowLeftIcon, ArrowRightIcon, SendIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

import { placeOrderAction } from '@/app/(frontend)/actions'
import { CartLines } from '@/components/cart/CartLines'
import { CHECKOUT_STAGES, CheckoutProgress } from '@/components/checkout/CheckoutProgress'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Button } from '@/components/shadcn/button'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { RadioGroup, RadioGroupItem } from '@/components/shadcn/radio-group'
import { Textarea } from '@/components/shadcn/textarea'
import { useCart } from '@/hooks/useCart'
import { describeDeliveryFee } from '@/lib/delivery'
import { formatHuf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { addressSchema, customerSchema } from '@/schemas/checkout'
import type { FieldErrors } from '@/types/common'
import type { DeliveryMethod } from '@/types/settings'

type CheckoutFormProps = {
  deliveryMethods: DeliveryMethod[]
  collection: { address: string; openingHours: string[]; note: string }
}

type AddressState = { postalCode: string; city: string; street: string }

type CustomerState = { name: string; email: string; phone: string; companyName: string; taxNumber: string }

type TextFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error: string | undefined
  autoComplete?: string
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  optional?: boolean
}

/** The form owns stages 0–3; stage 4 (Visszaigazolás) is the confirmation page after a successful order. */
const PANEL_TITLES: readonly string[] = CHECKOUT_STAGES.slice(0, 4)
const LAST_PANEL: number = PANEL_TITLES.length - 1

type FocusIntent = 'heading' | 'invalid'
const KEY_STORAGE: string = 'benyom-penztar-kulcs'
const EMPTY_ADDRESS: AddressState = { postalCode: '', city: '', street: '' }

function TextField(props: TextFieldProps): React.JSX.Element {
  const errorId = `${props.id}-hiba`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>
        {props.label}
        {props.optional ? <span className="font-normal text-muted-foreground"> (nem kötelező)</span> : null}
      </Label>
      <Input
        id={props.id}
        name={props.id}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        required={!props.optional}
      />
      {props.error ? (
        <p id={errorId} className="text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

function newKey(): string {
  const key = crypto.randomUUID()
  try {
    window.sessionStorage.setItem(KEY_STORAGE, key)
  } catch {
    // Without sessionStorage a reload creates a new key; the server still deduplicates retries within this page.
  }
  return key
}

function stepForField(field: string): number {
  if (field.startsWith('lines')) return 0
  if (field.startsWith('customer') || field.startsWith('billingAddress')) return 1
  if (field.startsWith('shippingAddress') || field.startsWith('deliveryMethodId') || field === 'note') return 2
  return 3
}

export function CheckoutForm(props: CheckoutFormProps): React.JSX.Element {
  const cart = useCart()
  const router = useRouter()
  const [step, setStep] = useState<number>(0)
  const [customer, setCustomer] = useState<CustomerState>({ name: '', email: '', phone: '', companyName: '', taxNumber: '' })
  const [billing, setBilling] = useState<AddressState>(EMPTY_ADDRESS)
  const [shipping, setShipping] = useState<AddressState>(EMPTY_ADDRESS)
  const [sameAsBilling, setSameAsBilling] = useState<boolean>(true)
  const [methodId, setMethodId] = useState<string>(props.deliveryMethods.find((method) => method.enabled && method.fee.kind !== 'unknown')?.id ?? '')
  const [note, setNote] = useState<string>('')
  const [terms, setTerms] = useState<boolean>(false)
  const [privacy, setPrivacy] = useState<boolean>(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)
  /** +1 forward, -1 backward: drives the panel slide direction. */
  const [direction, setDirection] = useState<number>(1)
  const idempotencyKey = useRef<string>('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const focusIntent = useRef<FocusIntent | null>(null)
  const submittingRef = useRef<boolean>(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    try {
      idempotencyKey.current = window.sessionStorage.getItem(KEY_STORAGE) ?? newKey()
    } catch {
      idempotencyKey.current = newKey()
    }
  }, [])

  const focusTarget = (intent: FocusIntent): void => {
    const invalid = intent === 'invalid' ? panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') : null
    // Groups (e.g. the delivery radio group) are not focusable themselves: focus their first enabled control.
    const target = invalid?.matches('input, button, select, textarea') ? invalid : invalid?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])')
    if (target) target.focus()
    else headingRef.current?.focus()
  }

  /** Changes panel; focus moves once the incoming panel has finished animating. */
  const goTo = (target: number, intent: FocusIntent): void => {
    if (target === step) {
      requestAnimationFrame(() => focusTarget(intent))
      return
    }
    focusIntent.current = intent
    setDirection(target > step ? 1 : -1)
    setStep(target)
  }

  const onPanelShown = (): void => {
    const intent = focusIntent.current
    focusIntent.current = null
    if (intent) focusTarget(intent)
  }

  const method = props.deliveryMethods.find((item) => item.id === methodId)
  const fee = method?.fee.kind === 'fixed' ? method.fee.amount : 0
  const itemsTotal = cart.quote?.itemsTotal ?? 0

  function validate(target: number): FieldErrors {
    const found: FieldErrors = {}
    const collect = (prefix: string, result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): void => {
      for (const issue of result.error?.issues ?? []) found[`${prefix}.${issue.path.map(String).join('.')}`] ??= issue.message
    }
    if (target >= 1) {
      collect('customer', customerSchema.safeParse(customer))
      collect('billingAddress', addressSchema.safeParse({ ...billing, country: 'HU' }))
    }
    if (target >= 2) {
      if (!method || method.fee.kind === 'unknown' || !method.enabled) found.deliveryMethodId = 'Válasszon elérhető átvételi módot.'
      if (method?.kind === 'delivery' && !sameAsBilling) collect('shippingAddress', addressSchema.safeParse({ ...shipping, country: 'HU' }))
    }
    if (target >= 3) {
      if (!terms) found.termsAccepted = 'Az előrendeléshez el kell fogadnia az ÁSZF-et.'
      if (!privacy) found.privacyAccepted = 'Kérjük, igazolja, hogy megismerte az adatkezelési tájékoztatót.'
    }
    return found
  }

  function next(): void {
    const found = validate(step)
    setErrors(found)
    const invalid = Object.keys(found).length > 0
    setFormError(invalid ? 'Kérjük, javítsa a megjelölt mezőket.' : null)
    // Never advance past invalid required fields; focus the first one instead.
    goTo(invalid ? step : step + 1, invalid ? 'invalid' : 'heading')
  }

  async function submit(): Promise<void> {
    if (submittingRef.current) return
    const found = validate(LAST_PANEL)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFormError('Kérjük, javítsa a megjelölt mezőket.')
      goTo(Math.min(...Object.keys(found).map(stepForField)), 'invalid')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setFormError(null)
    const shippingAddress = method?.kind === 'delivery' ? { ...(sameAsBilling ? billing : shipping), country: 'HU' } : null
    const result = await placeOrderAction({
      idempotencyKey: idempotencyKey.current,
      lines: cart.lines,
      customer,
      billingAddress: { ...billing, country: 'HU' },
      deliveryMethodId: methodId,
      shippingAddress,
      note,
      termsAccepted: terms,
      privacyAccepted: privacy,
    }).catch(() => null)
    if (!result || !result.ok) {
      submittingRef.current = false
      setSubmitting(false)
    }
    if (!result) {
      setFormError('A kapcsolat megszakadt. Próbálja újra – a rendelés nem lesz kétszer rögzítve.')
      requestAnimationFrame(() => focusTarget('heading'))
      return
    }
    if (!result.ok) {
      // Stay on (or return to) the panel that owns the failing fields, with the message shown.
      setErrors(result.fieldErrors)
      setFormError(result.message)
      const fields = Object.keys(result.fieldErrors)
      goTo(fields.length > 0 ? Math.min(...fields.map(stepForField)) : step, fields.length > 0 ? 'invalid' : 'heading')
      void cart.refresh()
      return
    }
    // Success: keep the button locked while navigating to the confirmation stage.
    try {
      window.sessionStorage.removeItem(KEY_STORAGE)
    } catch {
      // ignore
    }
    cart.clear()
    router.push('/rendeles/koszonjuk')
  }

  if (cart.hydrated && cart.lines.length === 0) {
    return (
      <p>
        A kosár üres.{' '}
        <Link href="/termekek" className="font-semibold text-primary underline">
          Termékek böngészése
        </Link>
      </p>
    )
  }

  const distance = reduceMotion ? 0 : 24
  const panelVariants: Variants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * distance }),
    center: { opacity: 1, x: 0, pointerEvents: 'auto' },
    // Outgoing panel cannot be clicked while it fades out.
    exit: (dir: number) => ({ opacity: 0, x: -dir * distance, pointerEvents: 'none' }),
  }

  const setCustomerField = (field: keyof CustomerState) => (value: string): void => setCustomer({ ...customer, [field]: value })
  const setBillingField = (field: keyof AddressState) => (value: string): void => setBilling({ ...billing, [field]: value })
  const setShippingField = (field: keyof AddressState) => (value: string): void => setShipping({ ...shipping, [field]: value })

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <CheckoutProgress current={step} onSelect={(stage: number) => goTo(stage, 'heading')} />

        <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-xl font-bold outline-none">
          {PANEL_TITLES[step]}
        </h2>

        {formError ? (
          <Alert variant="destructive" className="mb-4" role="alert">
            <AlertTitle>Hiba</AlertTitle>
            <AlertDescription>
              <p>{formError}</p>
              {Object.keys(errors).length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {Object.entries(errors).map(([field, message]) => (
                    <li key={field}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div ref={panelRef} className="overflow-x-clip">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={panelVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: reduceMotion ? 0.01 : 0.18, ease: 'easeOut' }}
          onAnimationComplete={(definition: unknown) => {
            if (definition === 'center') onPanelShown()
          }}
        >
        {step === 0 ? (
          <div className="rounded-xl border px-4">
            <CartLines />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 font-semibold">Kapcsolattartó</legend>
              <TextField id="nev" label="Teljes név" value={customer.name} onChange={setCustomerField('name')} error={errors['customer.name']} autoComplete="name" />
              <TextField id="email" label="E-mail-cím" type="email" value={customer.email} onChange={setCustomerField('email')} error={errors['customer.email']} autoComplete="email" />
              <TextField id="telefon" label="Telefonszám" type="tel" value={customer.phone} onChange={setCustomerField('phone')} error={errors['customer.phone']} autoComplete="tel" />
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 font-semibold">Számlázási adatok</legend>
              <TextField id="cegnev" label="Cégnév" optional value={customer.companyName} onChange={setCustomerField('companyName')} error={errors['customer.companyName']} autoComplete="organization" />
              <TextField id="adoszam" label="Adószám" optional value={customer.taxNumber} onChange={setCustomerField('taxNumber')} error={errors['customer.taxNumber']} />
              <TextField id="szamlazasi-irsz" label="Irányítószám" inputMode="numeric" value={billing.postalCode} onChange={setBillingField('postalCode')} error={errors['billingAddress.postalCode']} autoComplete="billing postal-code" />
              <TextField id="szamlazasi-telepules" label="Település" value={billing.city} onChange={setBillingField('city')} error={errors['billingAddress.city']} autoComplete="billing address-level2" />
              <div className="sm:col-span-2">
                <TextField id="szamlazasi-utca" label="Utca, házszám" value={billing.street} onChange={setBillingField('street')} error={errors['billingAddress.street']} autoComplete="billing street-address" />
              </div>
            </fieldset>
            <p className="text-sm text-muted-foreground">Számlát a webshop nem állít ki automatikusan.</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <fieldset>
              <legend className="mb-3 font-semibold">Átvétel módja</legend>
              <RadioGroup value={methodId} onValueChange={setMethodId} aria-invalid={errors.deliveryMethodId ? true : undefined} aria-describedby={errors.deliveryMethodId ? 'mod-hiba' : undefined} className="gap-3">
                {props.deliveryMethods
                  .filter((item) => item.enabled)
                  .map((item) => {
                    const disabled = item.fee.kind === 'unknown'
                    return (
                      <Label key={item.id} htmlFor={`mod-${item.id}`} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal has-[[data-state=checked]]:border-ink', disabled && 'cursor-not-allowed opacity-60')}>
                        <RadioGroupItem id={`mod-${item.id}`} value={item.id} disabled={disabled} className="mt-1" />
                        <span>
                          <span className="block font-semibold">{item.name}</span>
                          <span className="block text-sm text-muted-foreground">{item.description}</span>
                          <span className="mt-1 block text-sm font-semibold">{describeDeliveryFee(item.fee)}</span>
                        </span>
                      </Label>
                    )
                  })}
              </RadioGroup>
              {errors.deliveryMethodId ? (
                <p id="mod-hiba" className="mt-2 text-sm text-destructive">
                  {errors.deliveryMethodId}
                </p>
              ) : null}
            </fieldset>

            {method?.kind === 'collection' ? (
              <div className="rounded-xl bg-muted p-4 text-sm">
                <p className="font-semibold">Átvételi hely: {props.collection.address}</p>
                <ul className="mt-1">
                  {props.collection.openingHours.map((line: string) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2">{props.collection.note}</p>
              </div>
            ) : null}

            {method?.kind === 'delivery' ? (
              <fieldset className="space-y-4">
                <legend className="mb-2 font-semibold">Szállítási cím</legend>
                <div className="flex items-center gap-2">
                  <Checkbox id="azonos-cim" checked={sameAsBilling} onCheckedChange={(value) => setSameAsBilling(value === true)} />
                  <Label htmlFor="azonos-cim" className="font-normal">
                    Megegyezik a számlázási címmel
                  </Label>
                </div>
                {!sameAsBilling ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="szallitasi-irsz" label="Irányítószám" inputMode="numeric" value={shipping.postalCode} onChange={setShippingField('postalCode')} error={errors['shippingAddress.postalCode']} autoComplete="shipping postal-code" />
                    <TextField id="szallitasi-telepules" label="Település" value={shipping.city} onChange={setShippingField('city')} error={errors['shippingAddress.city']} autoComplete="shipping address-level2" />
                    <div className="sm:col-span-2">
                      <TextField id="szallitasi-utca" label="Utca, házszám" value={shipping.street} onChange={setShippingField('street')} error={errors['shippingAddress.street']} autoComplete="shipping street-address" />
                    </div>
                  </div>
                ) : null}
              </fieldset>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="megjegyzes">
                Megjegyzés <span className="font-normal text-muted-foreground">(nem kötelező)</span>
              </Label>
              <Textarea id="megjegyzes" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
        ) : null}

        {step === LAST_PANEL ? (
          <div className="space-y-6">
            <div className="rounded-xl border px-4">
              <CartLines readOnly />
            </div>
            <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-muted p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Kapcsolattartó</dt>
                <dd>
                  {customer.name} · {customer.email} · {customer.phone}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Számlázási cím</dt>
                <dd>
                  {customer.companyName ? `${customer.companyName}, ` : ''}
                  {billing.postalCode} {billing.city}, {billing.street}
                  {customer.taxNumber ? ` · Adószám: ${customer.taxNumber}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Átvétel</dt>
                <dd>{method?.name}</dd>
              </div>
              {method?.kind === 'delivery' ? (
                <div>
                  <dt className="font-semibold">Szállítási cím</dt>
                  <dd>{sameAsBilling ? 'Azonos a számlázási címmel' : `${shipping.postalCode} ${shipping.city}, ${shipping.street}`}</dd>
                </div>
              ) : null}
            </dl>
            <Alert>
              <AlertTitle>Fizetés átvételkor</AlertTitle>
              <AlertDescription>Ez előrendelés: most nem fizet. A vételárat személyes átvételkor vagy a futárnál kell kiegyenlíteni. Kártyaadatot nem kérünk.</AlertDescription>
            </Alert>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox id="aszf" checked={terms} onCheckedChange={(value) => setTerms(value === true)} aria-invalid={errors.termsAccepted ? true : undefined} aria-describedby={errors.termsAccepted ? 'aszf-hiba' : undefined} className="mt-0.5" />
                <Label htmlFor="aszf" className="block leading-snug font-normal">
                  Elolvastam és elfogadom az{' '}
                  <Link href="/info/aszf" target="_blank" className="underline">
                    Általános szerződési feltételeket
                  </Link>
                  , és tudomásul veszem, hogy a leadott előrendelés fizetési kötelezettséggel jár átvételkor.
                </Label>
              </div>
              {errors.termsAccepted ? (
                <p id="aszf-hiba" className="text-sm text-destructive">
                  {errors.termsAccepted}
                </p>
              ) : null}
              <div className="flex items-start gap-2">
                <Checkbox id="adatvedelem" checked={privacy} onCheckedChange={(value) => setPrivacy(value === true)} aria-invalid={errors.privacyAccepted ? true : undefined} aria-describedby={errors.privacyAccepted ? 'adatvedelem-hiba' : undefined} className="mt-0.5" />
                <Label htmlFor="adatvedelem" className="block leading-snug font-normal">
                  Megismertem az{' '}
                  <Link href="/info/adatvedelem" target="_blank" className="underline">
                    Adatkezelési tájékoztatót
                  </Link>
                  .
                </Label>
              </div>
              {errors.privacyAccepted ? (
                <p id="adatvedelem-hiba" className="text-sm text-destructive">
                  {errors.privacyAccepted}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        </motion.div>
        </AnimatePresence>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goTo(step - 1, 'heading')} disabled={submitting}>
              <ArrowLeftIcon aria-hidden="true" />
              Vissza
            </Button>
          ) : (
            <span />
          )}
          {step < LAST_PANEL ? (
            <Button type="button" size="lg" onClick={next} disabled={!cart.quote || cart.quote.hasUnavailable || cart.pending}>
              Tovább
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={() => void submit()} loading={submitting} disabled={!cart.quote || cart.quote.hasUnavailable}>
              {submitting ? null : <SendIcon aria-hidden="true" />}
              {submitting ? 'Küldés…' : 'Előrendelés elküldése'}
            </Button>
          )}
        </div>
      </div>

      <aside className="h-fit space-y-2 rounded-xl bg-muted p-5 text-sm" aria-label="Rendelés összesítő">
        <div className="flex justify-between gap-3">
          <span>Termékek</span>
          <span>{cart.quote ? formatHuf(itemsTotal) : '…'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{method?.name ?? 'Átvétel'}</span>
          <span>{method ? describeDeliveryFee(method.fee) : '–'}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold text-ink">
          <span>Fizetendő átvételkor</span>
          <span>{cart.quote ? formatHuf(itemsTotal + fee) : '…'}</span>
        </div>
        <p className="text-xs text-muted-foreground">Az árakat és a díjat a szerver a beküldéskor ellenőrzi.</p>
      </aside>
    </div>
  )
}
