/**
 * Cloudflare Worker 入口 —— 路由分发
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleChat } from './chat'
import { listProjects, getIndexStats } from './db'
import { checkRateLimit, extractClientIP } from './guardrails'

type Env = {
  DEEPSEEK_API_KEY: string
  DEEPSEEK_MODEL?: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  OPENAI_API_KEY?: string
  EMBEDDING_PROVIDER?: string
  CANDIDATE_NAME?: string
  CANDIDATE_TITLE?: string
  GITHUB_USERNAME?: string
  AGENT_LANGUAGE?: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }))

app.get('/api/health', async (c) => {
  try {
    const stats = await getIndexStats(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY)
    return c.json({ ok: true, ...stats })
  } catch {
    return c.json({ ok: true, lastIndexedAt: null })
  }
})

app.get('/api/projects', async (c) => {
  try {
    const projects = await listProjects(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY)
    return c.json(projects)
  } catch {
    return c.json([])
  }
})

app.post('/api/chat', async (c) => {
  const clientIp = extractClientIP(c.req.raw)
  if (!checkRateLimit(clientIp)) {
    return c.json({ error: '请求过于频繁（20次/分钟）' }, 429)
  }

  let body: { question?: string; history?: unknown[]; scope?: string }
  try { body = await c.req.json() } catch { return c.json({ error: '无效请求体' }, 400) }
  if (!body.question?.trim()) return c.json({ error: '问题不能为空' }, 400)

  return handleChat({
    question: body.question!,
    history: (body.history ?? []) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    scope: body.scope,
    env: c.env,
  })
})

app.all('/api/*', c => c.json({ error: 'Not Found' }, 404))
app.all('*', c => c.json({ error: 'Not Found' }, 404))

export default app
