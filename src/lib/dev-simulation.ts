import 'server-only'

export type EmailFailureMode =
  | { kind: 'none' }
  | { kind: 'fail-next'; remaining: number }
  | { kind: 'fail-all' }

type SimulationState = { emailFailure: EmailFailureMode }

const SIMULATION_KEY: unique symbol = Symbol.for('benyom.simulation')
type SimulationGlobal = typeof globalThis & { [SIMULATION_KEY]?: SimulationState }

function state(): SimulationState {
  const holder = globalThis as SimulationGlobal
  holder[SIMULATION_KEY] ??= { emailFailure: { kind: 'none' } }
  return holder[SIMULATION_KEY]
}

export function getEmailFailureMode(): EmailFailureMode {
  return state().emailFailure
}

export function setEmailFailureMode(mode: EmailFailureMode): void {
  state().emailFailure = mode
}

/** Returns true when the current send should fail, consuming one "fail-next" credit. */
export function consumeSimulatedEmailFailure(): boolean {
  const current = state().emailFailure
  if (current.kind === 'fail-all') return true
  if (current.kind === 'fail-next' && current.remaining > 0) {
    state().emailFailure = current.remaining > 1 ? { kind: 'fail-next', remaining: current.remaining - 1 } : { kind: 'none' }
    return true
  }
  return false
}
