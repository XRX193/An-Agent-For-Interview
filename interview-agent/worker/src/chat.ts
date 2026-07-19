/**
 * POST /api/chat 核心对话逻辑
 */
import { validateQuestion } from './guardrails'
import { retrieveRelevantDocs } from './retrieve'
import { buildSystemPrompt, extractFileRefs } from './prompt'
import type { ChatRequest, ChatEvent, WorkerEnv } from './types'

export async function handleChat(request: ChatRequest): Promise<Response> {
  const env = request.env

  const validationError = validateQuestion(request.question)
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const profile = {
    name: env.CANDIDATE_NAME ?? '候选人',
    title: env.CANDIDATE_TITLE ?? '软件工程师',
    githubUsername: env.GITHUB_USERNAME ?? 'XRX193',
    language: env.AGENT_LANGUAGE ?? 'zh-CN',
  }

  const { chunks, projects } = await retrieveRelevantDocs(request.question, env, request.scope)

  const systemPrompt = buildSystemPrompt(profile, projects, chunks, request.history)

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const h of request.history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }
  messages.push({ role: 'user', content: request.question })

  return streamDeepSeekResponse(env, messages, chunks)
}

async function streamDeepSeekResponse(env: WorkerEnv, messages: Array<{ role: string; content: string }>, retrievedChunks: ChatEvent['chunks']): Promise<Response> {
  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '服务未配置 DEEPSEEK_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const body = JSON.stringify({ model: env.DEEPSEEK_MODEL ?? 'deepseek-chat', messages, max_tokens: 4096, temperature: 0.7, stream: true })

  let response: Response
  try {
    response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body,
    })
  } catch (err) {
    console.error('[chat] Network error:', err)
    return new Response(JSON.stringify({ error: 'AI 服务网络错误' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  if (!response.ok) {
    const errText = await response.text()
    console.error('[chat] DeepSeek error:', response.status, errText)
    return new Response(JSON.stringify({ error: `AI 服务调用失败 (${response.status})` }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  void processStream(response, writer, encoder, retrievedChunks).catch(err => { console.error(err); void writer.close() })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' },
  })
}

async function processStream(llmResponse: Response, writer: WritableStreamDefaultWriter<Uint8Array>, encoder: TextEncoder, retrievedChunks: ChatEvent['chunks']): Promise<void> {
  const reader = llmResponse.body?.getReader()
  if (!reader) { void writer.close(); return }

  const decoder = new TextDecoder()
  let buffer = '', fullAnswer = ''

  try {
    if (retrievedChunks && retrievedChunks.length > 0) {
      void writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'context', chunks: retrievedChunks })}\n\n`))
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
          const content = event.choices?.[0]?.delta?.content
          if (content) {
            fullAnswer += content
            void writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', delta: content })}\n\n`))
          }
        } catch { continue }
      }
    }

    const { fileRefs } = extractFileRefs(fullAnswer, retrievedChunks ?? [])
    for (const ref of fileRefs) {
      void writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'file_ref', fileRef: ref })}\n\n`))
    }
    void writer.write(encoder.encode('data: [DONE]\n\n'))
  } catch (err) {
    void writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`))
  } finally {
    void writer.close()
    reader.releaseLock()
  }
}
