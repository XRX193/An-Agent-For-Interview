/**
 * 问题向量化
 *
 * 支持多种 Embedding 服务：
 * - OpenAI text-embedding-3-small
 * - Voyage AI voyage-code-2
 *
 * 如果所有 Embedding 服务都不可用，抛出错误，
 * 调用方（retrieve.ts）会自动降级到关键词搜索。
 */

/**
 * 将问题文本转为向量
 * 如果无法获取 Embedding，抛出错误让调用方降级
 */
export async function embedText(text: string): Promise<number[]> {
  const provider = (globalThis as unknown as Record<string, string>).EMBEDDING_PROVIDER ?? 'openai'

  if (provider === 'voyage') {
    return embedWithVoyage(text)
  }

  // 尝试 OpenAI，失败则抛出
  try {
    return await embedWithOpenAI(text)
  } catch (err) {
    console.warn('[embed] OpenAI embedding failed:', err)
    throw err
  }
}

/**
 * 使用 OpenAI text-embedding-3-small
 */
async function embedWithOpenAI(text: string): Promise<number[]> {
  const apiKey = (globalThis as unknown as Record<string, string>).OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY — using keyword search instead')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 512,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI Embedding API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }
  return data.data[0].embedding
}

/**
 * 使用 Voyage AI voyage-code-2
 */
async function embedWithVoyage(text: string): Promise<number[]> {
  const apiKey = (globalThis as unknown as Record<string, string>).VOYAGE_API_KEY
  if (!apiKey) throw new Error('Missing VOYAGE_API_KEY')

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'voyage-code-2',
      input: text,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Voyage Embedding API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }
  return data.data[0].embedding
}
