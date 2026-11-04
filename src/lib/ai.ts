import Anthropic from '@anthropic-ai/sdk'

/**
 * Capa de IA de túbio (la «Varita»). Un solo proveedor real (Anthropic, SDK oficial) y uno simulado para pruebas y
 * para trabajar sin llave. Configuración por entorno:
 *   TUBIO_AI_PROVIDER = anthropic | mock | off   (sin valor: anthropic si hay llave, si no off)
 *   TUBIO_AI_KEY      = llave de la API de Anthropic
 *   TUBIO_AI_MODEL    = modelo (por omisión claude-opus-5-5)
 *   TUBIO_AI_EFFORT   = low | medium | high (por omisión medium)
 */
export type AiProvider = 'anthropic' | 'mock' | 'off'

export type AiConfig = { provider: AiProvider; key: string; model: string; effort: 'low' | 'medium' | 'high' }

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const key = env.TUBIO_AI_KEY ?? ''
  const raw = (env.TUBIO_AI_PROVIDER ?? '').trim()
  const provider: AiProvider = raw === 'anthropic' || raw === 'mock' || raw === 'off' ? raw : key ? 'anthropic' : 'off'
  const effort = env.TUBIO_AI_EFFORT === 'low' || env.TUBIO_AI_EFFORT === 'high' ? env.TUBIO_AI_EFFORT : 'medium'
  return { provider: provider === 'anthropic' && !key ? 'off' : provider, key, model: env.TUBIO_AI_MODEL || 'claude-opus-5-5', effort }
}

/** USD por millón de tokens (entrada, salida). Si el modelo no está, se cobra como Opus 5.5. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
  'claude-fable-5-1': [10, 50],
}

export function costUsd(model: string, inTok: number, outTok: number): number {
  const [i, o] = PRICES[model] ?? PRICES['claude-opus-5-5']!
  return (inTok * i + outTok * o) / 1_000_000
}

export type AiUsage = { model: string; input_tokens: number; output_tokens: number; usd: number }

export class AiError extends Error {
  /** clave de i18n para mostrar a la persona */
  readonly key: string
  constructor(key: string, message: string) {
    super(message)
    this.key = key
  }
}

let cached: { key: string; client: Anthropic } | null = null
export function anthropicClient(cfg: AiConfig): Anthropic {
  if (!cached || cached.key !== cfg.key) cached = { key: cfg.key, client: new Anthropic({ apiKey: cfg.key, maxRetries: 2, timeout: 120_000 }) }
  return cached.client
}

/** Traduce los errores del SDK a algo que la persona entienda; el detalle va a la bitácora */
export function aiErrorOf(e: unknown): AiError {
  if (e instanceof AiError) return e
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('ai.err_config', `auth: ${e.message}`)
  if (e instanceof Anthropic.RateLimitError) return new AiError('ai.err_busy', `429: ${e.message}`)
  if (e instanceof Anthropic.BadRequestError) {
    // sin saldo en la cuenta de Anthropic llega como 400
    return new AiError(/credit balance/i.test(e.message) ? 'ai.err_config' : 'ai.err_failed', `400: ${e.message}`)
  }
  if (e instanceof Anthropic.APIError) return new AiError('ai.err_busy', `${e.status}: ${e.message}`)
  return new AiError('ai.err_failed', e instanceof Error ? e.message : String(e))
}
