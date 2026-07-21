/**
 * useChat — 对话核心 Hook
 *
 * 管理消息列表状态 + SSE 流式接收 + 发送/清空/重试操作
 * 维护 AbortController 生命周期，支持流中断和错误恢复
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ChatRequest, ConversationState, FileRef, Message } from '../types'
import { apiUrl } from '../lib/api'
import { parseSSEStream } from '../lib/streamParser'
import config from '../config'

const HISTORY_LIMIT = config.limits.max_history_rounds

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
    async (question: string, scope?: string, historyOverride?: Message[]) => {
      if (!question.trim() || state.isStreaming) return

      const baseMessages = historyOverride ?? state.messages

      // 添加用户消息
      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: question,
        timestamp: Date.now(),
        scope,
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
        messages: [...baseMessages, userMsg, assistantMsg],
        isStreaming: true,
        error: null,
      }))

      // 构建请求体
      const body: ChatRequest = {
        question,
        history: baseMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-(HISTORY_LIMIT * 2))
          .map((m) => ({ role: m.role, content: m.content })),
        scope,
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch(apiUrl('/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`API Error ${response.status}: ${await response.text()}`)
        }

        if (!response.body) {
          throw new Error('API 未返回可读取的数据流')
        }

        const reader = response.body.getReader()
        let accumulatedContent = ''
        const files: FileRef[] = []

        for await (const event of parseSSEStream(reader)) {
          switch (event.type) {
            case 'token':
              accumulatedContent += event.delta ?? ''
              updateLastAssistant(setState, { content: accumulatedContent })
              break

            case 'file_ref':
              if (event.fileRef && !files.some((file) => file.url === event.fileRef?.url)) {
                files.push(event.fileRef)
                updateLastAssistant(setState, { files: [...files] })
              }
              break

            case 'context':
              updateLastAssistant(setState, { context: event.chunks ?? [] })
              break

            case 'error':
              throw new Error(event.message ?? 'AI 服务返回错误')

            case 'done':
              updateLastAssistant(setState, {
                isStreaming: false,
                files: files.length > 0 ? [...files] : undefined,
              }, false)
              return
          }
        }

        // 流结束（没有收到 [DONE] 的情况）
        updateLastAssistant(setState, {
          isStreaming: false,
          files: files.length > 0 ? [...files] : undefined,
        }, false)
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
      } finally {
        if (abortRef.current === controller) abortRef.current = null
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
    const lastUserIndex = state.messages.findLastIndex((m) => m.role === 'user')
    if (lastUserIndex < 0) return

    const lastUser = state.messages[lastUserIndex]
    const priorMessages = state.messages.slice(0, lastUserIndex)
    void send(lastUser.content, lastUser.scope, priorMessages)
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

function updateLastAssistant(
  setState: Dispatch<SetStateAction<ConversationState>>,
  patch: Partial<Message>,
  isStreaming?: boolean,
): void {
  setState((state) => {
    const messages = [...state.messages]
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      messages[messages.length - 1] = { ...last, ...patch }
    }
    return {
      ...state,
      messages,
      isStreaming: isStreaming ?? state.isStreaming,
    }
  })
}
