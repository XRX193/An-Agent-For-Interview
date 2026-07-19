import { searchSimilarDocs, searchByKeywords, listProjects } from './db'
import { embedText } from './embed'
import type { Chunk, Project, WorkerEnv } from './types'

const LEVEL_WEIGHT: Record<string, number> = { project: 1.0, architecture: 0.9, code: 1.0, history: 0.7 }

export async function retrieveRelevantDocs(question: string, env: WorkerEnv, scope?: string) {
  const projectsPromise = listProjects(env.SUPABASE_URL, env.SUPABASE_ANON_KEY).catch(() => [] as Project[])

  let embedding: number[] | null = null
  try { embedding = await embedText(question, env) } catch { /* fallback */ }

  const projects = await projectsPromise

  if (embedding) {
    const docs = await searchSimilarDocs(embedding, { limit: 7, matchThreshold: 0.3, scope, url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY })
    const chunks: Chunk[] = docs.map(doc => ({ id: doc.id, repo: doc.repo, path: doc.path, content: doc.content, level: doc.level, score: (doc.score ?? 0) * (LEVEL_WEIGHT[doc.level] ?? 0.8) }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5)
    return { chunks, projects, method: 'vector' as const }
  }

  const docs = await searchByKeywords(question, { limit: 5, scope, url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY })
  const chunks: Chunk[] = docs.map(doc => ({ id: doc.id, repo: doc.repo, path: doc.path, content: doc.content, level: doc.level, score: LEVEL_WEIGHT[doc.level] ?? 0.8 }))
  return { chunks, projects, method: 'keyword' as const }
}
