import type { Document, Project, WorkerEnv } from './types'
import config from './config'

interface IndexEntry {
  id?: string
  repo: string
  path: string
  content: string
  level: Document['level']
  language: string
  start_line?: number
  end_line?: number
  metadata?: Record<string, unknown>
}

interface SearchIndex {
  generated_at?: string
  chunks: IndexEntry[]
}

interface IndexSource {
  owner: string
  repository: string
  branch: string
}

interface CacheEntry {
  data: SearchIndex
  cachedAt: number
}

const indexCache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000

function indexSource(env: WorkerEnv): IndexSource {
  return {
    owner: env.INDEX_REPO_OWNER ?? config.index_storage.repository_owner,
    repository: env.INDEX_REPO_NAME ?? config.index_storage.repository_name,
    branch: env.INDEX_REPO_BRANCH ?? config.index_storage.branch,
  }
}

async function loadIndex(env: WorkerEnv): Promise<SearchIndex> {
  const source = indexSource(env)
  const url = `https://raw.githubusercontent.com/${source.owner}/${source.repository}/${source.branch}/interview-agent/search_index.json`
  const now = Date.now()
  const cached = indexCache.get(url)
  if (cached && now - cached.cachedAt < CACHE_TTL) return cached.data

  try {
    const response = await fetch(url, { cf: { cacheTtl: 300 } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const value = await response.json() as Partial<SearchIndex>
    if (!Array.isArray(value.chunks)) throw new Error('Invalid search index')
    const data: SearchIndex = { generated_at: value.generated_at, chunks: value.chunks }
    indexCache.set(url, { data, cachedAt: now })
    return data
  } catch (error) {
    if (cached) return cached.data
    throw error
  }
}

export async function hydrateDocumentsByIds(
  matches: Array<{ id: string; score: number }>,
  env: WorkerEnv,
): Promise<Document[]> {
  const { chunks } = await loadIndex(env)
  const entriesById = new Map(
    chunks.map((entry) => [entry.id ?? fallbackId(entry), entry]),
  )

  return matches.flatMap(({ id, score }) => {
    const entry = entriesById.get(id)
    return entry ? [toDocument(entry, score)] : []
  })
}

/** 将中文连续文本拆成二元词组，同时保留英文和技术标识符。 */
export function tokenizeQuery(query: string): string[] {
  const normalized = query.toLowerCase()
  const tokens = new Set<string>()

  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9_.+#-]*/g)) {
    if (match[0].length > 1) tokens.add(match[0])
  }
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const text = match[0]
    if (text.length <= 4) tokens.add(text)
    for (let index = 0; index < text.length - 1; index++) {
      tokens.add(text.slice(index, index + 2))
    }
  }

  return [...tokens]
}

function countOccurrences(text: string, token: string): number {
  let count = 0
  let offset = 0
  while ((offset = text.indexOf(token, offset)) !== -1) {
    count++
    offset += token.length
  }
  return count
}

function fallbackId(entry: IndexEntry): string {
  return `${entry.repo}:${entry.path}:${entry.start_line ?? 0}:${entry.end_line ?? 0}`
}

function toDocument(entry: IndexEntry, score: number): Document {
  return {
    id: entry.id ?? fallbackId(entry),
    repo: entry.repo,
    path: entry.path,
    content: entry.content,
    embedding: [],
    level: entry.level,
    language: entry.language,
    score,
    startLine: entry.start_line,
    endLine: entry.end_line,
    defaultBranch: typeof entry.metadata?.default_branch === 'string'
      ? entry.metadata.default_branch
      : 'main',
    metadata: entry.metadata ?? {},
  }
}

export async function searchByKeywords(
  query: string,
  env: WorkerEnv,
  options: { limit?: number; scope?: string } = {},
): Promise<Document[]> {
  const { chunks } = await loadIndex(env)
  const tokens = tokenizeQuery(query)
  const candidates = options.scope ? chunks.filter((entry) => entry.repo === options.scope) : chunks
  const levelBonus: Record<string, number> = { project: 0.5, architecture: 0.35, code: 0.25, history: 0.15 }

  const scored = candidates.flatMap((entry) => {
    const content = entry.content.toLowerCase()
    const path = entry.path.toLowerCase()
    const repo = entry.repo.toLowerCase()
    let keywordScore = 0

    for (const token of tokens) {
      keywordScore += Math.min(countOccurrences(content, token), 8)
      if (path.includes(token)) keywordScore += 3
      if (repo.includes(token)) keywordScore += 5
    }
    if (tokens.length > 0 && keywordScore === 0) return []

    return [{ entry, rawScore: keywordScore + (levelBonus[entry.level] ?? 0) }]
  })

  scored.sort((left, right) => right.rawScore - left.rawScore)
  const topScore = scored[0]?.rawScore ?? 1
  return scored
    .slice(0, options.limit ?? 5)
    .map(({ entry, rawScore }) => toDocument(entry, rawScore / topScore))
}

function metadataValue<T>(entry: IndexEntry, key: string, fallback: T): T {
  const value = entry.metadata?.[key]
  return (value === undefined || value === null ? fallback : value) as T
}

export async function listProjects(env: WorkerEnv): Promise<Project[]> {
  const { chunks } = await loadIndex(env)
  const githubUser = env.GITHUB_USERNAME ?? config.github_username
  const entries = chunks.filter((entry) => entry.path === '__meta__')

  return entries.map((entry) => ({
    name: entry.repo,
    description: metadataValue(entry, 'description', ''),
    language: metadataValue(entry, 'primary_language', entry.language || ''),
    stars: metadataValue(entry, 'stars', 0),
    url: metadataValue(entry, 'html_url', `https://github.com/${githubUser}/${entry.repo}`),
    topics: metadataValue(entry, 'topics', []),
    lastUpdated: metadataValue(entry, 'updated_at', ''),
    defaultBranch: metadataValue(entry, 'default_branch', 'main'),
  }))
}

export async function getIndexStats(env: WorkerEnv) {
  const index = await loadIndex(env)
  const repos = new Set(index.chunks.map((entry) => entry.repo)).size
  return {
    totalDocs: index.chunks.length,
    totalRepos: repos,
    lastIndexedAt: index.generated_at ?? null,
  }
}
