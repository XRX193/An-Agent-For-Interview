import type { WorkerEnv } from './types'

export async function embedText(text: string, env: WorkerEnv): Promise<number[]> {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set — using keyword search')

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 512 }),
  })

  if (!response.ok) throw new Error(`OpenAI Embedding error ${response.status}`)
  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}
