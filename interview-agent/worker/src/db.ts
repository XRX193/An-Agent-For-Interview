import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Document, Project } from './types'

let client: SupabaseClient | null = null

/**
 * 获取 Supabase 客户端（单例）
 */
export function getSupabase(): SupabaseClient {
  if (client) return client

  const url = (globalThis as unknown as Record<string, string>).SUPABASE_URL
  const key = (globalThis as unknown as Record<string, string>).SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable')
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  })

  return client
}

/**
 * 按向量相似度检索文档
 *
 * Supabase pgvector 使用的匹配函数名取决于建表时的选择。
 * 这里假定表名为 `documents`，向量列名为 `embedding`，
 * 查询使用 `match_documents` RPC 函数或 `<=>` 运算符。
 */
export async function searchSimilarDocs(
  embedding: number[],
  options: {
    limit?: number
    matchThreshold?: number
    scope?: string
  } = {},
): Promise<Document[]> {
  const { limit = 5, matchThreshold = 0.5, scope } = options
  const db = getSupabase()

  // 使用 RPC 或直接 SQL 查询
  let query = db
    .rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: limit,
    })

  if (scope) {
    query = query.filter('repo', 'eq', scope)
  }

  const { data, error } = await query

  if (error) {
    console.error('[db] Vector search error:', error)
    return []
  }

  return (data as unknown as Document[]) ?? []
}

/**
 * 获取所有已索引的项目列表
 */
export async function listProjects(): Promise<Project[]> {
  const db = getSupabase()

  const { data, error } = await db.rpc('list_projects')

  if (error) {
    console.error('[db] List projects error:', error)
    return []
  }

  return (data as unknown as Project[]) ?? []
}

/**
 * 关键词文本搜索（无 Embedding 时的降级方案）
 *
 * 使用 PostgreSQL ILIKE 做模糊匹配，按内容相似度排序。
 */
export async function searchByKeywords(
  query: string,
  options: {
    limit?: number
    scope?: string
  } = {},
): Promise<Document[]> {
  const { limit = 5, scope } = options
  const db = getSupabase()

  // 拆分成关键词，每个词作为一个 ILIKE 条件
  const keywords = query
    .replace(/[?？,，。.！!、\s]+/g, ' ')
    .trim()
    .split(' ')
    .filter((k) => k.length > 0)

  if (keywords.length === 0) {
    return []
  }

  // 构建 ILIKE OR 过滤器
  let dbQuery = db
    .from('documents')
    .select('id, repo, path, content, level, language, metadata')

  // 对每个关键词添加过滤
  for (const kw of keywords.slice(0, 5)) {
    dbQuery = dbQuery.or(`content.ilike.%${kw}%,path.ilike.%${kw}%`, { referencedTable: undefined })
  }

  if (scope) {
    dbQuery = dbQuery.eq('repo', scope)
  }

  const { data, error } = await dbQuery.limit(limit * 2)

  if (error) {
    console.error('[db] Keyword search error:', error)
    return []
  }

  // 简单排序：短结果优先（更可能是项目描述/README），代码级降权
  const docs = (data as unknown as Document[]) ?? []
  docs.sort((a, b) => {
    const levelOrder: Record<string, number> = { project: 0, architecture: 1, code: 2, history: 3 }
    return (levelOrder[a.level] ?? 2) - (levelOrder[b.level] ?? 2)
  })

  return docs.slice(0, limit)
}

/**
 * 获取索引健康状态
 */
export async function getIndexStats(): Promise<{
  totalDocs: number
  totalRepos: number
  lastIndexedAt: string | null
}> {
  const db = getSupabase()

  const { data, error } = await db.rpc('index_stats')

  if (error) {
    console.error('[db] Index stats error:', error)
    return { totalDocs: 0, totalRepos: 0, lastIndexedAt: null }
  }

  return data as unknown as { totalDocs: number; totalRepos: number; lastIndexedAt: string | null }
}
