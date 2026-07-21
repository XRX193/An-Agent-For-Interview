import type { ChatEvent } from '../types'

/**
 * SSE 流解析器
 *
 * 用法：
 * ```ts
 * const response = await fetch(url, { body, headers })
 * const reader = response.body!.getReader()
 * for await (const event of parseSSEStream(reader)) {
 *   // 处理每个 ChatEvent
 * }
 * ```
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<ChatEvent> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE 使用双换行分隔事件
    const parts = buffer.split(/\r?\n\r?\n/)
    // 最后一个可能不完整，保留到下次循环
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split(/\r?\n/)
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            yield { type: 'done' }
            return
          }
          try {
            const event = JSON.parse(data) as ChatEvent
            yield event
          } catch {
            // 跳过无法解析的行
            continue
          }
        }
      }
    }
  }

  // 处理残留的 buffer
  if (buffer.trim()) {
    const lines = buffer.split(/\r?\n/)
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          yield { type: 'done' }
          return
        }
        try {
          const event = JSON.parse(data) as ChatEvent
          yield event
        } catch {
          continue
        }
      }
    }
  }
}
