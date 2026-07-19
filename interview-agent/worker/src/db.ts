import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Document, Project } from './types'

const clients = new Map<string, SupabaseClient>()

function getClient(url: string, key: string): SupabaseClient {
  const k = `${url}::${key.slice(0, 10)}`
  if (clients.has(k)) return clients.get(k)!
  const c = createClient(url, key, { auth: { persistSession: false } })
  clients.set(k, c)
  return c
}

export async function searchSimilarDocs(embedding: number[], options: { limit?: number; matchThreshold?: number; scope?: string; url: string; key: string }): Promise<Document[]> {
  const { limit = 5, matchThreshold = 0.5, scope } = options
  const db = getClient(options.url, options.key)
  let q = db.rpc('match_documents', { query_embedding: embedding, match_threshold: matchThreshold, match_count: limit })
  if (scope) q = q.filter('repo', 'eq', scope)
  const { data, error } = await q
  if (error) { console.error('[db] Vector search error:', error); return [] }
  return (data as unknown as Document[]) ?? []
}

export async function searchByKeywords(query: string, options: { limit?: number; scope?: string; url: string; key: string }): Promise<Document[]> {
  const { limit = 5, scope } = options
  const db = getClient(options.url, options.key)
  const keywords = query.replace(/[?？,，。.！!、\s]+/g, ' ').trim().split(' ').filter(k => k.length > 0)
  if (!keywords.length) return []

  let dbQuery = db.from('documents').select('id, repo, path, content, level, language, metadata')
  for (const kw of keywords.slice(0, 5)) {
    dbQuery = dbQuery.or(`content.ilike.%${kw}%,path.ilike.%${kw}%`)
  }
  if (scope) dbQuery = dbQuery.eq('repo', scope)

  const { data, error } = await dbQuery.limit(limit * 2)
  if (error) { console.error('[db] Keyword search error:', error); return [] }
  const docs = (data as unknown as Document[]) ?? []
  const order: Record<string, number> = { project: 0, architecture: 1, code: 2, history: 3 }
  docs.sort((a, b) => (order[a.level] ?? 2) - (order[b.level] ?? 2))
  return docs.slice(0, limit)
}

export async function listProjects(supabaseUrl: string, supabaseKey: string): Promise<Project[]> {
  const db = getClient(supabaseUrl, supabaseKey)
  const { data, error } = await db.rpc('list_projects')
  if (error) { console.error('[db] List projects error:', error); return [] }
  return (data as unknown as Project[]) ?? []
}

export async function getIndexStats(supabaseUrl: string, supabaseKey: string): Promise<{ totalDocs: number; totalRepos: number; lastIndexedAt: string | null }> {
  const db = getClient(supabaseUrl, supabaseKey)
  const { data, error } = await db.rpc('index_stats')
  if (error) { console.error('[db] Index stats error:', error); return { totalDocs: 0, totalRepos: 0, lastIndexedAt: null } }
  return data as unknown as { totalDocs: number; totalRepos: number; lastIndexedAt: string | null }
}
