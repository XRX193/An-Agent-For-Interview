import { handleChat } from './chat'
import { listProjects, getIndexStats } from './db'
import { checkRateLimit, extractClientIP } from './guardrails'

interface Env {
  DEEPSEEK_API_KEY: string
  DEEPSEEK_MODEL?: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  OPENAI_API_KEY?: string
  CANDIDATE_NAME?: string
  CANDIDATE_TITLE?: string
  GITHUB_USERNAME?: string
  AGENT_LANGUAGE?: string
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // DEBUG: echo request info
    if (path === '/api/debug') {
      return json({ method: request.method, path, url: request.url })
    }

    // GET /api/health
    if (request.method === 'GET' && path === '/api/health') {
      try {
        const stats = await getIndexStats(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
        return json({ ok: true, ...stats })
      } catch {
        return json({ ok: true, lastIndexedAt: null })
      }
    }

    // GET /api/projects
    if (request.method === 'GET' && path === '/api/projects') {
      try {
        const projects = await listProjects(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
        return json(projects)
      } catch {
        return json([])
      }
    }

    // POST /api/chat 或 /chat
    if (request.method === 'POST' && (path === '/api/chat' || path === '/chat')) {
      const clientIp = extractClientIP(request)
      if (!checkRateLimit(clientIp)) {
        return json({ error: '请求过于频繁' }, 429)
      }

      let body: { question?: string; history?: unknown[]; scope?: string }
      try {
        body = await request.json()
      } catch {
        return json({ error: '无效请求体' }, 400)
      }

      if (!body.question?.trim()) {
        return json({ error: '问题不能为空' }, 400)
      }

      return handleChat({
        question: body.question!,
        history: (body.history ?? []) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        scope: body.scope,
        env,
      })
    }

    return json({ error: 'Not Found' }, 404)
  },
}
