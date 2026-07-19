/**
 * 文档检索 + 重排序
 *
 * 检索策略（按优先级）：
 * 1. 向量检索（如果有 Embedding API）
 * 2. 关键词文本搜索（降级方案，无需 Embedding）
 */
import { searchSimilarDocs, searchByKeywords, listProjects } from './db'
import { embedText } from './embed'
import type { Chunk, Project } from './types'

/** 层级权重 */
const LEVEL_WEIGHT: Record<string, number> = {
  project: 1.0,
  architecture: 0.9,
  code: 1.0,
  history: 0.7,
}

export interface RetrieveResult {
  chunks: Chunk[]
  projects: Project[]
  /** 使用的检索方式 */
  method: 'vector' | 'keyword'
}

/**
 * 检索与问题相关的文档和项目
 */
export async function retrieveRelevantDocs(
  question: string,
  scope?: string,
): Promise<RetrieveResult> {
  // 并行获取项目列表
  const projectsPromise = listProjects().catch((err) => {
    console.error('[retrieve] List projects error:', err)
    return [] as Project[]
  })

  // 尝试向量检索
  let embedding: number[] | null = null
  try {
    embedding = await embedText(question)
  } catch (err) {
    console.warn('[retrieve] Embedding failed, falling back to keyword search:', err)
  }

  const projects = await projectsPromise

  if (embedding) {
    // 向量检索
    const docs = await searchSimilarDocs(embedding, {
      limit: 7,
      matchThreshold: 0.3,
      scope,
    })

    const chunks: Chunk[] = docs
      .map((doc) => ({
        id: doc.id,
        repo: doc.repo,
        path: doc.path,
        content: doc.content,
        level: doc.level,
        score: (doc.score ?? 0) * (LEVEL_WEIGHT[doc.level] ?? 0.8),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 5)

    return { chunks, projects, method: 'vector' }
  }

  // 降级：关键词文本搜索
  const docs = await searchByKeywords(question, {
    limit: 5,
    scope,
  })

  const chunks: Chunk[] = docs.map((doc) => ({
    id: doc.id,
    repo: doc.repo,
    path: doc.path,
    content: doc.content,
    level: doc.level,
    score: LEVEL_WEIGHT[doc.level] ?? 0.8,
  }))

  return { chunks, projects, method: 'keyword' }
}
