import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeApiBase } from '../src/lib/apiBase.ts'

test('adds the API prefix to a Worker root URL', () => {
  assert.equal(
    normalizeApiBase('https://interview-agent-api.example.workers.dev'),
    'https://interview-agent-api.example.workers.dev/api',
  )
})

test('keeps an existing API prefix without duplicate slashes', () => {
  assert.equal(
    normalizeApiBase('https://interview-agent-api.example.workers.dev/api/'),
    'https://interview-agent-api.example.workers.dev/api',
  )
})

test('uses the local API proxy when no URL is configured', () => {
  assert.equal(normalizeApiBase(undefined), '/api')
})
