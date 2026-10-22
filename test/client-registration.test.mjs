import assert from 'node:assert/strict'
import test from 'node:test'

/** Planned `useState` values for the next component call. */
let statePlan = []

/** Minimal React stand-in: hooks read from plans and effects never run. */
const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    const planned = statePlan.length > 0 ? statePlan.shift() : undefined
    return [planned !== undefined ? planned : initial, () => {}]
  },
  useEffect() {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
}

let registration
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      registration = definition
    },
  },
}
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })

await import('../client.js')

/**
 * Build a Client context stand-in that records slot registrations.
 * @returns captured registrations.
 */
function fakeClient() {
  const captured = { slots: [] }
  const ctx = {
    effect: (callback) => callback(),
    slots: {
      inject: (_key, callback) => callback(),
      register: (definition, component) => {
        captured.slots.push({ definition, component })
        return () => {}
      },
    },
  }
  return { ctx, captured }
}

test('registers one composer dock entry beside the prediction row', () => {
  assert.equal(registration.id, 'dsh-plugin-composer-history')
  const module = registration.factory((spec) => {
    assert.equal(spec, 'react')
    return React
  })
  assert.deepEqual(module.inject, ['slots'])

  const { ctx, captured } = fakeClient()
  module.apply(ctx)
  assert.deepEqual(captured.slots[0].definition, {
    name: 'conversation.composer.dock',
    id: 'composer-history',
    order: 4,
  })
})

/**
 * Render the registered component against one composer snapshot.
 * @param overrides - snapshot and state overrides.
 * @returns the produced element tree, or null.
 */
function render(overrides = {}) {
  const { ctx, captured } = fakeClient()
  registration.factory(() => React).apply(ctx)
  const component = captured.slots[0].component
  const input = { draft: '', attachmentIds: [], phase: 'plain', ...(overrides.input ?? {}) }
  const session = { running: false, blank: false, removed: false, ...(overrides.session ?? {}) }
  const props = {
    sessionId: 'session-test',
    useInput: (select) => select(input),
    useSession: (select) => select(session),
    inputActions: { setDraft() {} },
  }
  statePlan = [overrides.position === undefined ? null : overrides.position]
  const outer = component(props)
  return outer === null ? null : outer.type(outer.props)
}

test('always renders the hidden anchor, and the counter only while browsing', () => {
  const idle = render()
  assert.equal(idle.type, React.Fragment)
  assert.equal(idle.children[0].props.style.display, 'none')
  assert.equal(idle.children[1], null)

  const browsing = render({ position: { index: 2, total: 5 } })
  assert.deepEqual(browsing.children[1].children, ['3/5'])
  assert.equal(browsing.children[1].props.title, '↑ ↓')
})

test('renders nothing when the slot lacks the composer hooks', () => {
  const { ctx, captured } = fakeClient()
  registration.factory(() => React).apply(ctx)
  const component = captured.slots[0].component
  assert.equal(component({ sessionId: 'session-test' }), null)
  assert.equal(component({ sessionId: 'session-test', useInput: () => '' }), null)
})
