/**
 * 类型定义 — 面试 Agent 全局类型
 *
 * 涵盖消息（Message）、文件引用（FileRef）、检索片段（Chunk）、
 * 项目（Project）、SSE 事件（ChatEvent）、对话状态（ConversationState）
 */
/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 文件引用 —— 回答中引用的代码文件 */
export interface FileRef {
  repo: string
  path: string
  line?: number
  /** 代码片段预览 */
  snippet?: string
  /** GitHub 直达链接 */
  url: string
}

/** 单条对话消息 */
export interface Message {
  id: string
  role: MessageRole
  content: string
  /** 回答中引用的文件列表 */
  files?: FileRef[]
  /** 检索到的上下文片段 */
  context?: Chunk[]
  timestamp: number
  /** 是否正在流式生成中 */
  isStreaming?: boolean
}

/** 检索到的代码块 */
export interface Chunk {
  id: string
  repo: string
  path: string
  content: string
  /** 所属层级：project | architecture | code | history */
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
  /** 技术栈标签 */
  topics: string[]
  lastUpdated: string
}

/** POST /api/chat 请求体 */
export interface ChatRequest {
  question: string
  history: Array<{ role: MessageRole; content: string }>
  /** 限定项目范围（可选，"@项目名"） */
  scope?: string
}

/** POST /api/chat 响应 —— SSE 流中的每个事件 */
export interface ChatEvent {
  type: 'token' | 'file_ref' | 'context' | 'done' | 'error'
  /** token 类型时的文本增量 */
  delta?: string
  /** file_ref 类型时的文件引用 */
  fileRef?: FileRef
  /** context 类型时的检索上下文 */
  chunks?: Chunk[]
  /** error 类型时的错误消息 */
  message?: string
}

/** 对话状态 */
export interface ConversationState {
  messages: Message[]
  isStreaming: boolean
  error: string | null
}
