/**
 * API 客户端 — 封装后端 HTTP 请求
 *
 * 提供 sendChat（非流式）、sendChatStream（SSE 流式）、
 * fetchProjects、healthCheck 四个接口方法
 * 开发环境通过 Vite 代理转发，生产环境直连 Cloudflare Worker
 */
import type { Project } from '../types'
import { normalizeApiBase } from './apiBase'

/** API 基础 URL —— 生产环境指向 Cloudflare Worker，开发环境指向本地代理 */
const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE)

/** 构建 API URL，调用方统一传入以 / 开头的路由。 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
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

/** 获取项目列表 */
export async function fetchProjects(): Promise<Project[]> {
  return request('/projects')
}

/** 检查服务状态 */
export async function healthCheck(): Promise<{ ok: boolean; lastIndexedAt: string | null }> {
  return request('/health')
}
