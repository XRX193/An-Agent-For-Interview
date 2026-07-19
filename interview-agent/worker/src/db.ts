import type { Document, Project } from './types'

interface IndexEntry {
  repo: string
  path: string
  content: string
  level: string
  language: string
}

let cachedIndex: IndexEntry[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/** 从 GitHub raw 加载 search_index.json */
async function loadIndex(githubUser: string): Promise<IndexEntry[]> {
  const now = Date.now()
  if (cachedIndex && (now - cacheTime) < CACHE_TTL) return cachedIndex

  try {
    const url = `https://raw.githubusercontent.com/${githubUser}/An-Agent-For-Interview/main/interview-agent/search_index.json`
    const resp = await fetch(url, { cf: { cacheTtl: 300 } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json() as { repos?: string[]; total_chunks?: number; chunks?: IndexEntry[] }
    cachedIndex = data.chunks ?? []
    cacheTime = now
    return cachedIndex!
  } catch (e) {
    console.error('[db] Failed to load index:', e)
    return cachedIndex ?? []
  }
}

const DEFAULT_USER = 'XRX193'

export async function searchByKeywords(
  query: string,
  options: { limit?: number; scope?: string; url: string; key: string; githubUser: string },
): Promise<Document[]> {
  const githubUser = options.githubUser || DEFAULT_USER
  const docs = await loadIndex(githubUser)
  if (!docs.length) return []

  const keywords = query.replace(/[?？,，。.！!、\s]+/g, ' ').trim().split(' ').filter(k => k.length > 1)

  let results = docs
  if (options.scope) results = results.filter(d => d.repo === options.scope)

  // 关键词匹配打分
  const scored = results.map(d => {
    let score = 0
    const text = (d.content + ' ' + d.path + ' ' + d.repo).toLowerCase()
    const levelBonus: Record<string, number> = { project: 5, architecture: 3, code: 1, history: 2 }
    score += levelBonus[d.level] ?? 0
    for (const kw of keywords) {
      const count = (text.match(new RegExp(kw.toLowerCase(), 'g')) || []).length
      score += count * 2
    }
    if (keywords.length === 0) score = levelBonus[d.level] ?? 0
    return { ...d, score }
  }).filter(d => d.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, options.limit ?? 5) as unknown as Document[]
}

export async function searchSimilarDocs(
  embedding: number[],
  options: { limit?: number; matchThreshold?: number; scope?: string; url: string; key: string; githubUser: string },
): Promise<Document[]> {
  // 无 Embedding 时用关键词降级
  return []
}

export async function listProjects(_url: string, _key: string, githubUser: string = DEFAULT_USER): Promise<Project[]> {
  const docs = await loadIndex(githubUser)
  const seen = new Set<string>()
  const projects: Project[] = []
  for (const d of docs) {
    if (seen.has(d.repo)) continue
    seen.add(d.repo)
    projects.push({
      name: d.repo,
      description: '',
      language: d.language || '',
      stars: 0,
      url: `https://github.com/${githubUser}/${d.repo}`,
      topics: [],
      lastUpdated: '',
    })
  }
  return projects
}

export async function getIndexStats(_url: string, _key: string, githubUser: string = DEFAULT_USER) {
  const docs = await loadIndex(githubUser)
  const repos = new Set(docs.map(d => d.repo)).size
  return { totalDocs: docs.length, totalRepos: repos, lastIndexedAt: null }
}
