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

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }))

// 临时：极简测试路由
app.post('/api/chat', async (c) => {
  const env = c.env
  if (!env.DEEPSEEK_API_KEY) {
    return c.json({ error: 'MISSING_DEEPSEEK_API_KEY' })
  }
  return handleChat({
    question: (await c.req.json()).question ?? '',
    history: [],
    env: env,
  })
})

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

app.all('*', c => c.text('Not Found', 404))

export default app
