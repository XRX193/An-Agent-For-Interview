/**
 * useChat — 对话核心 Hook
 *
 * 管理消息列表状态 + SSE 流式接收 + 发送/清空/重试操作
 * 维护 AbortController 生命周期，支持流中断和错误恢复
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatRequest, ConversationState, FileRef, Message } from '../types'

const HISTORY_LIMIT = 10

/** 生成唯一 ID */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 对话逻辑 Hook —— 管理消息状态 + SSE 流处理
 */
export function useChat() {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    isStreaming: false,
    error: null,
  })

  const abortRef = useRef<AbortController | null>(null)

  // 清理：组件卸载时取消请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  /** 发送消息 */
  const send = useCallback(
    async (question: string, scope?: string) => {
      if (!question.trim() || state.isStreaming) return

      // 添加用户消息
      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: question,
        timestamp: Date.now(),
      }

      // 预创建 assistant 占位消息
      const assistantMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMsg, assistantMsg],
        isStreaming: true,
        error: null,
      }))

      // 构建请求体
      const body: ChatRequest = {
        question,
        history: state.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        scope,
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const apiBase = import.meta.env.VITE_API_BASE ?? '/api'
        const response = await fetch(`${apiBase}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`API Error ${response.status}: ${await response.text()}`)
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedContent = ''
        const files: FileRef[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const lines = part.split('\n')
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue

              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                // 流结束
                setState((s) => {
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last && last.role === 'assistant') {
                    msgs[msgs.length - 1] = {
                      ...last,
                      isStreaming: false,
                      files: files.length > 0 ? [...files] : undefined,
                    }
                  }
                  return { ...s, messages: msgs, isStreaming: false }
                })
                return
              }

              try {
                const event = JSON.parse(data)
                switch (event.type) {
                  case 'token':
                    accumulatedContent += event.delta ?? ''
                    setState((s) => {
                      const msgs = [...s.messages]
                      const last = msgs[msgs.length - 1]
                      if (last && last.role === 'assistant') {
                        msgs[msgs.length - 1] = {
                          ...last,
                          content: accumulatedContent,
                        }
                      }
                      return { ...s, messages: msgs }
                    })
                    break

                  case 'file_ref':
                    if (event.fileRef) {
                      files.push(event.fileRef)
                      setState((s) => {
                        const msgs = [...s.messages]
                        const last = msgs[msgs.length - 1]
                        if (last && last.role === 'assistant') {
                          msgs[msgs.length - 1] = {
                            ...last,
                            files: [...files],
                          }
                        }
                        return { ...s, messages: msgs }
                      })
                    }
                    break

                  case 'error':
                    throw new Error(event.message ?? 'Unknown error')
                }
              } catch (parseErr) {
                // 跳过无法解析的 SSE 行
                if (parseErr instanceof Error && parseErr.message.startsWith('API')) {
                  throw parseErr
                }
                continue
              }
            }
          }
        }

        // 流结束（没有收到 [DONE] 的情况）
        setState((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant') {
            msgs[msgs.length - 1] = {
              ...last,
              isStreaming: false,
              files: files.length > 0 ? [...files] : undefined,
            }
          }
          return { ...s, messages: msgs, isStreaming: false }
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return

        setState((s) => {
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (last && last.role === 'assistant') {
            msgs[msgs.length - 1] = {
              ...last,
              content: last.content || `出错了：${(err as Error).message}`,
              isStreaming: false,
            }
          }
          return {
            ...s,
            messages: msgs,
            isStreaming: false,
            error: (err as Error).message,
          }
        })
      }
    },
    [state.isStreaming, state.messages],
  )

  /** 清空对话 */
  const clear = useCallback(() => {
    abortRef.current?.abort()
    setState({ messages: [], isStreaming: false, error: null })
  }, [])

  /** 重试最后一条消息（如果出错） */
  const retry = useCallback(() => {
    if (state.messages.length < 2) return
    // 找到最后一条用户消息
    const msgs = [...state.messages]
    // 移除失败的 assistant 消息
    msgs.pop()
    const lastUser = msgs.filter((m) => m.role === 'user').pop()
    if (lastUser) {
      setState((s) => ({ ...s, messages: msgs }))
      send(lastUser.content)
    }
  }, [state.messages, send])

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    error: state.error,
    send,
    clear,
    retry,
    historyLimit: HISTORY_LIMIT,
  }
}
