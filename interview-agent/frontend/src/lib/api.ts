import type { ChatRequest, Project } from '../types'

/** API 基础 URL —— 生产环境指向 Cloudflare Worker，开发环境指向本地代理 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API Error ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

/** 发送对话消息（非流式） */
export async function sendChat(body: ChatRequest): Promise<{ answer: string }> {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** 发送对话消息（流式 SSE） */
export function sendChatStream(body: ChatRequest): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).catch(() => {
    /* 由调用方处理 abort */
  })

  return controller
}

/** 获取项目列表 */
export async function fetchProjects(): Promise<Project[]> {
  return request('/projects')
}

/** 检查服务状态 */
export async function healthCheck(): Promise<{ ok: boolean; lastIndexedAt: string }> {
  return request('/health')
}
