/**
 * Cloudflare Worker 入口 —— 路由分发
 *
 * 路由：
 *   POST /api/chat      → 对话接口（SSE 流式返回）
 *   GET  /api/projects   → 项目列表
 *   GET  /api/health     → 健康检查
 *   OPTIONS /api/*       → CORS 预检
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleChat } from './chat'
import { listProjects, getIndexStats } from './db'
import { checkRateLimit, extractClientIP, getRateLimitRemaining } from './guardrails'

// ---------- 应用初始化 ----------

const app = new Hono()

// CORS
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

// ===== 健康检查 =====
app.get('/api/health', async (c) => {
  try {
    const stats = await getIndexStats()
    return c.json({
      ok: true,
      lastIndexedAt: stats.lastIndexedAt,
      totalDocs: stats.totalDocs,
      totalRepos: stats.totalRepos,
    })
  } catch {
    return c.json({ ok: true, lastIndexedAt: null })
  }
})

// ===== 项目列表 =====
app.get('/api/projects', async (c) => {
  try {
    const projects = await listProjects()
    return c.json(projects)
  } catch (err) {
    console.error('[api] List projects error:', err)
    return c.json([], 200)
  }
})

// ===== 对话接口（核心） =====
app.post('/api/chat', async (c) => {
  // 速率限制
  const clientIp = extractClientIP(c.req.raw)
  if (!checkRateLimit(clientIp)) {
    return c.json(
      { error: '请求过于频繁，请稍后再试（20次/分钟）' },
      429,
    )
  }

  // 解析请求体
  let body: { question?: string; history?: unknown[]; scope?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '无效的请求体' }, 400)
  }

  if (!body.question?.trim()) {
    return c.json({ error: '问题不能为空' }, 400)
  }

  // 调用核心处理逻辑
  return handleChat({
    question: body.question,
    history: (body.history ?? []) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    scope: body.scope,
  })
})

// ===== 404 =====
app.all('/api/*', (c) => {
  return c.json({ error: 'Not Found' }, 404)
})

app.all('*', (c) => {
  return c.json({ error: 'Not Found' }, 404)
})

// ===== 导出 =====
export default app
