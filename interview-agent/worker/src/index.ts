import { handleChat } from './chat'
import { getIndexStats, listProjects } from './db'
import { checkRateLimit, extractClientIP } from './guardrails'
import type { WorkerEnv } from './types'
import config from './config'

const MAX_BODY_BYTES = 64 * 1024
const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CONTENT = 4_000

function allowedOrigins(env: WorkerEnv): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? config.security.allowed_origins.join(','))
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

function corsHeaders(request: Request, env: WorkerEnv): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  const origin = request.headers.get('Origin')
  if (origin && allowedOrigins(env).has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function isOriginAllowed(request: Request, env: WorkerEnv): boolean {
  const origin = request.headers.get('Origin')
  return !origin || allowedOrigins(env).has(origin)
}

function withCors(response: Response, request: Request, env: WorkerEnv): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(name, value)
  }
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

function parseHistory(value: unknown): Array<{ role: 'user' | 'assistant'; content: string }> | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_HISTORY_MESSAGES) return null

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const { role, content } = item as Record<string, unknown>
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    if (content.length > MAX_HISTORY_CONTENT) return null
    history.push({ role, content })
  }
  return history
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (!isOriginAllowed(request, env)) {
      return withCors(json({ error: 'Origin not allowed' }, 403), request, env)
    }

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request, env)
    }

    if (request.method === 'GET' && path === '/api/health') {
      try {
        const stats = await getIndexStats(env)
        return withCors(json({ ok: true, ...stats }), request, env)
      } catch (error) {
        console.error('[health] Index unavailable:', error)
        return withCors(json({ ok: false, error: '索引暂不可用' }, 503), request, env)
      }
    }

    if (request.method === 'GET' && path === '/api/projects') {
      try {
        return withCors(json(await listProjects(env)), request, env)
      } catch (error) {
        console.error('[projects] Failed to list projects:', error)
        return withCors(json({ error: '项目索引暂不可用' }, 503), request, env)
      }
    }

    if (request.method === 'POST' && path === '/api/chat') {
      const contentLength = Number(request.headers.get('Content-Length') ?? 0)
      if (contentLength > MAX_BODY_BYTES) {
        return withCors(json({ error: '请求体过大' }, 413), request, env)
      }

      const configuredLimit = Number.parseInt(
        env.RATE_LIMIT_PER_MINUTE ?? String(config.limits.rate_limit_per_minute),
        10,
      )
      const rateLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20
      if (!checkRateLimit(extractClientIP(request), rateLimit)) {
        return withCors(json({ error: '请求过于频繁' }, 429, { 'Retry-After': '60' }), request, env)
      }

      let body: Record<string, unknown>
      try {
        const rawBody = await request.text()
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
          return withCors(json({ error: '请求体过大' }, 413), request, env)
        }
        body = JSON.parse(rawBody) as Record<string, unknown>
      } catch {
        return withCors(json({ error: '无效请求体' }, 400), request, env)
      }

      if (typeof body.question !== 'string' || !body.question.trim()) {
        return withCors(json({ error: '问题不能为空' }, 400), request, env)
      }
      const history = parseHistory(body.history)
      if (!history) {
        return withCors(json({ error: '对话历史格式无效或过长' }, 400), request, env)
      }
      if (body.scope !== undefined && (typeof body.scope !== 'string' || body.scope.length > 100)) {
        return withCors(json({ error: '项目范围格式无效' }, 400), request, env)
      }

      try {
        const response = await handleChat({
          question: body.question,
          history,
          scope: body.scope as string | undefined,
          env,
        })
        return withCors(response, request, env)
      } catch (error) {
        console.error('[chat] Unhandled error:', error)
        return withCors(json({ error: '服务暂不可用' }, 500), request, env)
      }
    }

    return withCors(json({ error: 'Not Found' }, 404), request, env)
  },
}
