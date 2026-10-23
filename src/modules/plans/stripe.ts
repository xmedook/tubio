import { createHmac } from 'node:crypto'
import type { AppDeps } from '../../app.ts'
import { safeEqual } from '../../lib/crypto.ts'

/**
 * Stripe Checkout sin SDK: una sesión de pago por cada pago de tubio (mes, año o de por vida) y un
 * webhook firmado que lo marca pagado. La cuenta de Stripe se comparte con otros sistemas, así que
 * todo lo nuestro lleva metadata.app = "tubio" y el webhook ignora lo demás.
 */

export const stripeOn = () => !!process.env.TUBIO_STRIPE_SECRET_KEY

function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))))
    else if (typeof v === 'object') form(v as Record<string, unknown>, key, out)
    else out.append(key, String(v))
  }
  return out
}

export async function stripeApi<T = Record<string, unknown>>(deps: AppDeps, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const http = deps.fetch ?? fetch
  const r = await http(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.TUBIO_STRIPE_SECRET_KEY ?? ''}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: body ? form(body).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const j = (await r.json()) as T & { error?: { message?: string } }
  if (!r.ok) throw new Error(`stripe ${r.status}: ${j.error?.message ?? 'error'}`)
  return j
}

/** Verifica la cabecera Stripe-Signature (t=…,v1=…) sobre el cuerpo crudo; tolerancia 5 min */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, now: number): boolean {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2)) as Record<string, string>
  const t = Number(parts.t)
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  return header.split(',').some((p) => p.startsWith('v1=') && safeEqual(p.slice(3), expected))
}
