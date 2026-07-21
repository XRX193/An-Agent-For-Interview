/**
 * POST /api/chat 核心对话逻辑
 */
import { validateQuestion } from './guardrails'
import { retrieveRelevantDocs } from './retrieve'
import { buildSystemPrompt, extractFileRefs } from './prompt'
import type { ChatRequest, ChatEvent, WorkerEnv } from './types'
import config from './config'

export async function handleChat(request: ChatRequest): Promise<Response> {
  const env = request.env

  const validationError = validateQuestion(request.question)
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const profile = {
    name: env.CANDIDATE_NAME ?? config.ui.candidate_name,
    title: env.CANDIDATE_TITLE ?? config.ui.candidate_title,
    githubUsername: env.GITHUB_USERNAME ?? config.github_username,
    language: env.AGENT_LANGUAGE ?? config.language,
  }

  const { chunks, projects } = await retrieveRelevantDocs(request.question, env, request.scope)

  const systemPrompt = buildSystemPrompt(profile, projects, chunks)

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const h of request.history.slice(-20)) {
    messages.push({ role: h.role, content: h.content })
  }
  messages.push({ role: 'user', content: request.question })

  return streamDeepSeekResponse(env, messages, chunks, profile.githubUsername)
}

async function streamDeepSeekResponse(
  env: WorkerEnv,
  messages: Array<{ role: string; content: string }>,
  retrievedChunks: ChatEvent['chunks'],
  githubUsername: string,
): Promise<Response> {
  const apiKey = env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: '服务未配置 DEEPSEEK_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const body = JSON.stringify({ model: env.DEEPSEEK_MODEL ?? config.model.primary, messages, max_tokens: 4096, temperature: 0.7, stream: true })

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

  void processStream(response, writer, encoder, retrievedChunks, githubUsername).catch((error) => {
    console.error('[chat] Stream processing failed:', error)
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}

async function processStream(
  llmResponse: Response,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  retrievedChunks: ChatEvent['chunks'],
  githubUsername: string,
): Promise<void> {
  const reader = llmResponse.body?.getReader()
  if (!reader) { void writer.close(); return }

  const decoder = new TextDecoder()
  let buffer = '', fullAnswer = ''

  try {
    if (retrievedChunks && retrievedChunks.length > 0) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'context', chunks: retrievedChunks })}\n\n`))
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
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', delta: content })}\n\n`))
          }
        } catch { continue }
      }
    }

    const { fileRefs } = extractFileRefs(fullAnswer, retrievedChunks ?? [], githubUsername)
    for (const ref of fileRefs) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'file_ref', fileRef: ref })}\n\n`))
    }
    await writer.write(encoder.encode('data: [DONE]\n\n'))
  } catch (err) {
    console.error('[chat] Stream error:', err)
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'AI 响应流中断' })}\n\n`))
  } finally {
    await writer.close()
    reader.releaseLock()
  }
}
