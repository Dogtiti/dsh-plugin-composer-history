import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

const SESSION_ID = 'session-test'

/**
 * Build one live-Session stand-in that derives a mixed message stream.
 * @param seq - current event sequence.
 * @returns a fake Session.
 */
function fakeSession(seq = 5) {
  return {
    seq,
    deriveMessages: () => [
      { role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'system prompt' }] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '<runtime-context>injected</runtime-context>' }] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我建个公开仓库' }] },
      { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '好' }] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '发 npm' }] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '发 npm' }] },
      { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '换' }] },
      { role: 'developer', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'developer notice' }] },
    ],
    requestHeader: () => undefined,
  }
}

/**
 * Build a Host context stand-in that records the registered route.
 * @param options - fake session and captured calls.
 * @returns `{ ctx, route, session }`.
 */
function fakeHost(options = {}) {
  const session = options.session ?? fakeSession()
  const route = { current: undefined }
  const ctx = {
    effect(callback) {
      return callback()
    },
    get(name) {
      if (name === 'sessions') return { get: (id) => (id === SESSION_ID ? session : undefined) }
      return undefined
    },
  }
  ctx.connection = {
    fetch: {
      register(definition) {
        if (definition.path === '/api/composer.history') route.current = definition
        return () => {}
      },
    },
  }
  return { ctx, route, session }
}

/**
 * Call the registered route.
 * @param route - the captured route.
 * @param body - JSON body.
 * @returns the response.
 */
async function post(route, body) {
  return route.current.fetch(
    new Request('http://127.0.0.1:1/api/composer.history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

test('registers one POST route', () => {
  const { ctx, route } = fakeHost()
  apply(ctx, {})
  assert.equal(route.current.path, '/api/composer.history')
  assert.deepEqual(route.current.methods, ['POST'])
})

test('rejects a body without a session id', async () => {
  const { ctx, route } = fakeHost()
  apply(ctx, {})
  const response = await post(route, {})
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'missing-session')
})

test('reports an unknown session', async () => {
  const { ctx, route } = fakeHost()
  apply(ctx, {})
  assert.equal((await post(route, { sessionId: 'session-other' })).status, 404)
})

test('returns the prompts the user sent, oldest first', async () => {
  const { ctx, route } = fakeHost()
  apply(ctx, {})
  const { items } = await (await post(route, { sessionId: SESSION_ID })).json()
  assert.deepEqual(items, ['帮我建个公开仓库', '发 npm', '换'])
})

test('drops injected context and collapses consecutive duplicates', async () => {
  const { ctx, route } = fakeHost()
  apply(ctx, {})
  const { items } = await (await post(route, { sessionId: SESSION_ID })).json()
  assert.equal(items.some((item) => item.startsWith('<')), false)
  assert.equal(items.filter((item) => item === '发 npm').length, 1)
})

test('honours the limit and clips long prompts', async () => {
  const long = 'x'.repeat(500)
  const session = fakeSession()
  session.deriveMessages = () => [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }] },
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'b' }] },
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: long }] },
  ]
  const { ctx, route } = fakeHost({ session })
  apply(ctx, { limit: 2, maxChars: 40 })
  const { items } = await (await post(route, { sessionId: SESSION_ID })).json()
  assert.equal(items.length, 2)
  assert.equal(items[0], 'b')
  assert.ok(items[1].length <= 40)
  assert.match(items[1], /…/)
})

test('serves a repeated question from cache until the session advances', async () => {
  let calls = 0
  const session = fakeSession()
  const derive = session.deriveMessages
  session.deriveMessages = () => {
    calls += 1
    return derive()
  }
  const { ctx, route } = fakeHost({ session })
  apply(ctx, {})
  await post(route, { sessionId: SESSION_ID })
  await post(route, { sessionId: SESSION_ID })
  assert.equal(calls, 1)
  session.seq = 6
  await post(route, { sessionId: SESSION_ID })
  assert.equal(calls, 2)
})

test('honours the disabled switch', async () => {
  const { ctx, route } = fakeHost()
  apply(ctx, { enabled: false })
  const response = await post(route, { sessionId: SESSION_ID })
  assert.equal(response.status, 503)
  assert.deepEqual((await response.json()).items, [])
})
