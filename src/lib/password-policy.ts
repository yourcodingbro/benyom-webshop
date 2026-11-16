/**
 * Admin password rules, shared by the password-change screen (immediate feedback) and the server
 * (authoritative check). Hungarian messages, one per broken rule.
 */
export const PASSWORD_MIN_LENGTH: number = 12
export const PASSWORD_MAX_LENGTH: number = 128

export type PasswordCheckInput = {
  password: string
  confirmation: string
  email: string
}

export type PasswordProblems = {
  password: string[]
  confirmation: string | null
}

export function checkPasswordPolicy(input: PasswordCheckInput): PasswordProblems {
  const { password } = input
  const problems: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Legalább ${PASSWORD_MIN_LENGTH} karakter legyen.`)
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Legfeljebb ${PASSWORD_MAX_LENGTH} karakter lehet.`)
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern: RegExp) => pattern.test(password)).length
  if (classes < 3) problems.push('Legyen benne legalább háromféle karakter a következők közül: kisbetű, nagybetű, szám, írásjel.')
  if (/^\s|\s$/.test(password)) problems.push('Nem kezdődhet és nem végződhet szóközzel.')
  if (/(.)\1{3,}/.test(password)) problems.push('Ne ismételje ugyanazt a karaktert négyszer egymás után.')
  const localPart = input.email.split('@')[0]?.toLowerCase() ?? ''
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) problems.push('Ne tartalmazza az e-mail-címét.')
  return {
    password: problems,
    confirmation: input.confirmation === password ? null : 'A két jelszó nem egyezik.',
  }
}

export function isPasswordAcceptable(problems: PasswordProblems): boolean {
  return problems.password.length === 0 && problems.confirmation === null
}
