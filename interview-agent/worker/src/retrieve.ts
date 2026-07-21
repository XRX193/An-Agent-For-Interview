import { listProjects, searchByKeywords } from './db'
import type { Chunk, WorkerEnv } from './types'

export async function retrieveRelevantDocs(question: string, env: WorkerEnv, scope?: string) {
  const [projects, documents] = await Promise.all([
    listProjects(env),
    searchByKeywords(question, env, { limit: 5, scope }),
  ])

  const chunks: Chunk[] = documents.map((document) => ({
    id: document.id,
    repo: document.repo,
    path: document.path,
    content: document.content,
    level: document.level,
    score: document.score,
    startLine: document.startLine,
    endLine: document.endLine,
    defaultBranch: document.defaultBranch,
  }))

  return { chunks, projects, method: 'keyword' as const }
}
