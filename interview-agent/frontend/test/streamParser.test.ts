import assert from 'node:assert/strict'
import test from 'node:test'

import { parseSSEStream } from '../src/lib/streamParser.ts'

function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }).getReader()
}

test('parses fragmented CRLF events and preserves context', async () => {
  const reader = streamReader([
    'data: {"type":"token","delta":"你"}\r\n\r',
    '\ndata: {"type":"context","chunks":[{"id":"1","repo":"demo","path":"a.ts","content":"x","level":"code"}]}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ])

  const events = []
  for await (const event of parseSSEStream(reader)) events.push(event)

  assert.deepEqual(events.map((event) => event.type), ['token', 'context', 'done'])
  assert.equal(events[1].chunks?.[0]?.path, 'a.ts')
})

test('emits API errors instead of swallowing them', async () => {
  const reader = streamReader(['data: {"type":"error","message":"upstream failed"}\n\n'])
  const events = []
  for await (const event of parseSSEStream(reader)) events.push(event)

  assert.equal(events[0].type, 'error')
  assert.equal(events[0].message, 'upstream failed')
})
