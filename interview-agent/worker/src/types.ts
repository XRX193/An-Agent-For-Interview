/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 文件引用 */
export interface FileRef {
  repo: string
  path: string
  line?: number
  snippet?: string
  url: string
}

/** 检索到的代码块 */
export interface Chunk {
  id: string
  repo: string
  path: string
  content: string
  level: 'project' | 'architecture' | 'code' | 'history'
  score?: number
}

/** 项目概览 */
export interface Project {
  name: string
  description: string
  language: string
  stars: number
  url: string
  topics: string[]
  lastUpdated: string
}

/** POST /api/chat 请求体 */
export interface ChatRequest {
  question: string
  history: Array<{ role: MessageRole; content: string }>
  scope?: string
}

/** SSE 事件 */
export interface ChatEvent {
  type: 'token' | 'file_ref' | 'context' | 'done' | 'error'
  delta?: string
  fileRef?: FileRef
  chunks?: Chunk[]
  message?: string
}

/** 存储到 Supabase 的文档 */
export interface Document {
  id: string
  repo: string
  path: string
  content: string
  embedding: number[]
  level: 'project' | 'architecture' | 'code' | 'history'
  language?: string
  score?: number
  metadata: Record<string, unknown>
}
