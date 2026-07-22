import { hydrateDocumentsByIds, listProjects, searchByKeywords } from './db'
import type { Chunk, Document, WorkerEnv } from './types'
import config from './config'

const EMBEDDING_MODEL = '@cf/baai/bge-m3' as const

interface RetrievalResult {
  documents: Document[]
  method: 'vector' | 'keyword'
}

export async function searchByVector(
  question: string,
  env: WorkerEnv,
  options: { limit?: number; scope?: string } = {},
): Promise<Document[]> {
  if (!env.AI || !env.VECTOR_INDEX) {
    throw new Error('Vectorize bindings are unavailable')
  }
  if (config.retrieval.embedding_model !== EMBEDDING_MODEL) {
    throw new Error(`Unsupported embedding model: ${config.retrieval.embedding_model}`)
  }

  const output = await env.AI.run(EMBEDDING_MODEL, {
    text: [question],
    truncate_inputs: true,
  }) as { data?: number[][] }
  const vector = output.data?.[0]
  if (!vector || vector.length !== config.retrieval.embedding_dimensions) {
    throw new Error('Workers AI returned an invalid query embedding')
  }

  const result = await env.VECTOR_INDEX.query(vector, {
    topK: options.limit ?? config.limits.retrieve_top_k,
    returnMetadata: 'none',
    filter: options.scope ? { repo: options.scope } : undefined,
  })
  const matches = result.matches
    .filter((match) => match.score >= config.retrieval.min_vector_score)
    .map((match) => ({ id: match.id, score: match.score }))
  return hydrateDocumentsByIds(matches, env)
}

export async function searchWithFallback(
  question: string,
  env: WorkerEnv,
  options: { limit?: number; scope?: string } = {},
): Promise<RetrievalResult> {
  try {
    const documents = await searchByVector(question, env, options)
    if (documents.length > 0) return { documents, method: 'vector' }
  } catch (error) {
    console.warn('[retrieve] Vector search unavailable, using keyword fallback:', error)
  }

  return {
    documents: await searchByKeywords(question, env, options),
    method: 'keyword',
  }
}

export async function retrieveRelevantDocs(question: string, env: WorkerEnv, scope?: string) {
  const [projects, retrieval] = await Promise.all([
    listProjects(env),
    searchWithFallback(question, env, { limit: config.limits.retrieve_top_k, scope }),
  ])

  const chunks: Chunk[] = retrieval.documents.map((document) => ({
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

  return { chunks, projects, method: retrieval.method }
}
