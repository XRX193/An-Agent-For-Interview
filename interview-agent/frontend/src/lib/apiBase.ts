/** Normalize the configured Worker URL to the API route prefix. */
export function normalizeApiBase(value: string | undefined): string {
  const configured = value?.trim() || '/api'
  const base = configured.replace(/\/+$/, '')

  return base.endsWith('/api') ? base : `${base}/api`
}
