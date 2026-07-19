/**
 * POST /api/chat 核心对话逻辑
 *
 * 流程：
 * 1. 验证问题
 * 2. 检索相关文档（关键词搜索，若无 Embedding 则降级）
 * 3. 组装 System Prompt
 * 4. 调用 DeepSeek API（OpenAI 兼容流式 SSE）
 * 5. 返回 SSE 流到前端
 */
import { validateQuestion } from './guardrails'
import { retrieveRelevantDocs } from './retrieve'
import { buildSystemPrompt, extractFileRefs } from './prompt'
import type { ChatRequest, ChatEvent } from './types'

/** 候选人信息（从环境变量读取） */
const PROFILE = {
  name: (globalThis as unknown as Record<string, string>).CANDIDATE_NAME ?? '候选人',
  title: (globalThis as unknown as Record<string, string>).CANDIDATE_TITLE ?? '软件工程师',
  githubUsername: (globalThis as unknown as Record<string, string>).GITHUB_USERNAME ?? 'Rcardo',
  language: (globalThis as unknown as Record<string, string>).AGENT_LANGUAGE ?? 'zh-CN',
}

/** DeepSeek 配置 */
const DEEPSEEK_MODEL = (globalThis as unknown as Record<string, string>).DEEPSEEK_MODEL ?? 'deepseek-chat'
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'

/**
 * 处理聊天请求并返回 SSE 流
 */
export async function handleChat(request: ChatRequest): Promise<Response> {
  // 1. 验证问题
  const validationError = validateQuestion(request.question)
  if (validationError) {
    return new Response(
      JSON.stringify({ error: validationError }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // 2. 检索相关文档
  const { chunks, projects } = await retrieveRelevantDocs(
    request.question,
    request.scope,
  )

  // 3. 组装 System Prompt
  const systemPrompt = buildSystemPrompt(
    PROFILE,
    projects,
    chunks,
    request.history,
  )

  // 4. 构建消息（OpenAI 格式：system 作为一条消息）
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  // 追加对话历史
  for (const h of request.history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }
  // 当前问题
  messages.push({ role: 'user', content: request.question })

  // 5. 调用 DeepSeek API 并流式返回
  return streamDeepSeekResponse(messages, chunks)
}

/**
 * 流式调用 DeepSeek API（OpenAI 兼容格式）并转换为 SSE 事件
 */
async function streamDeepSeekResponse(
  messages: Array<{ role: string; content: string }>,
  retrievedChunks: ChatEvent['chunks'],
): Promise<Response> {
  const apiKey = (globalThis as unknown as Record<string, string>).DEEPSEEK_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: '服务配置错误：缺少 DEEPSEEK_API_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages,
    max_tokens: 4096,
    temperature: 0.7,
    stream: true,
  })

  let response: Response
  try {
    response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body,
    })
  } catch (err) {
    console.error('[chat] DeepSeek API network error:', err)
    return new Response(
      JSON.stringify({ error: 'AI 服务网络错误，请稍后重试' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error(`[chat] DeepSeek API error ${response.status}:`, errText)
    return new Response(
      JSON.stringify({ error: `AI 服务调用失败 (${response.status})，请稍后重试` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // 创建 SSE 转换流
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // 异步处理 DeepSeek 的 SSE 流
  void processDeepSeekStream(response, writer, encoder, retrievedChunks).catch((err) => {
    console.error('[chat] Stream processing error:', err)
    void writer.close()
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/**
 * 处理 DeepSeek 的 OpenAI 兼容 SSE 流
 *
 * DeepSeek SSE 格式：
 *   data: {"id":"...","choices":[{"delta":{"content":"你好"}}]}
 *   data: [DONE]
 */
async function processDeepSeekStream(
  llmResponse: Response,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  retrievedChunks: ChatEvent['chunks'],
): Promise<void> {
  const reader = llmResponse.body?.getReader()
  if (!reader) {
    void writer.close()
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let fullAnswer = ''

  try {
    // 先发送检索上下文
    if (retrievedChunks && retrievedChunks.length > 0) {
      const contextEvent: ChatEvent = { type: 'context', chunks: retrievedChunks }
      void writer.write(encoder.encode(`data: ${JSON.stringify(contextEvent)}\n\n`))
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const parts = buffer.split('\n')
      // 最后一行可能不完整，保留到下次
      buffer = parts.pop() ?? ''

      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string; role?: string }; finish_reason?: string | null }>
          }

          const delta = event.choices?.[0]?.delta
          if (delta?.content) {
            fullAnswer += delta.content
            const tokenEvent: ChatEvent = { type: 'token', delta: delta.content }
            void writer.write(encoder.encode(`data: ${JSON.stringify(tokenEvent)}\n\n`))
          }
        } catch {
          // 跳过无法解析的行
          continue
        }
      }
    }

    // 提取文件引用
    const { fileRefs } = extractFileRefs(fullAnswer, retrievedChunks ?? [])

    for (const ref of fileRefs) {
      const refEvent: ChatEvent = { type: 'file_ref', fileRef: ref }
      void writer.write(encoder.encode(`data: ${JSON.stringify(refEvent)}\n\n`))
    }

    // 发送结束标记
    void writer.write(encoder.encode('data: [DONE]\n\n'))
  } catch (err) {
    console.error('[chat] Stream read error:', err)
    const errorEvent: ChatEvent = { type: 'error', message: (err as Error).message }
    void writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
  } finally {
    void writer.close()
    reader.releaseLock()
  }
}
