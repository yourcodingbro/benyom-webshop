/** Error body shape of the admin endpoints (see collections/utils/endpoints.ts). */
export type AdminErrorBody = { error?: string; fieldErrors?: Record<string, string> | null }

export type AdminResponse<T> = { ok: boolean; status: number; body: Partial<T> & AdminErrorBody }

const OFFLINE: string = 'A szerver nem érhető el. Ellenőrizze a kapcsolatot, majd próbálja újra; a megadott adatok megmaradtak.'

/** JSON request from a custom admin component; a network failure becomes an error result, never a throw. */
export async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<AdminResponse<T>> {
  try {
    const response = await fetch(url, { credentials: 'include', ...init })
    const body = ((await response.json().catch(() => ({}))) ?? {}) as Partial<T> & AdminErrorBody
    return { ok: response.ok, status: response.status, body }
  } catch {
    return { ok: false, status: 0, body: { error: OFFLINE } as Partial<T> & AdminErrorBody }
  }
}

/** POST with a JSON body. */
export function adminPost<T>(url: string, body: unknown): Promise<AdminResponse<T>> {
  return adminRequest<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
