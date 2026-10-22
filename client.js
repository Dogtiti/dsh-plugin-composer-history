/**
 * Client half of the composer-history bundle.
 *
 * Binds ArrowUp / ArrowDown around the resident composer and repaints the draft with
 * the prompts this Session already sent. The list itself comes from the Host half,
 * because the Session log is the only source of truth for what was sent.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-composer-history',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Route registered by the Host half, addressed document-relatively. */
    const ROUTE = 'api/composer.history'

    /** The counter shown while browsing, matched to the host's composer chrome. */
    const COUNTER = {
      flex: 'none',
      padding: '0 4px',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '11px',
      lineHeight: '16px',
      fontVariantNumeric: 'tabular-nums',
      userSelect: 'none',
    }

    /** Whether a transport failure was already reported in this page. */
    let warned = false

    /**
     * Ask the Host half for this Session's sent prompts.
     * @param sessionId - Session to read.
     * @param signal - cancellation.
     * @returns prompts oldest first; an empty list on any failure.
     */
    async function requestHistory(sessionId, signal) {
      try {
        const response = await fetch(new URL(ROUTE, document.baseURI), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          credentials: 'same-origin',
          signal,
        })
        if (!response.ok) {
          if (warned !== true && response.status !== 404) {
            warned = true
            console.warn(`[composer-history] history route answered ${response.status}`)
          }
          return []
        }
        const data = await response.json()
        return Array.isArray(data?.items) ? data.items.filter((item) => typeof item === 'string' && item !== '') : []
      } catch {
        return []
      }
    }

    /**
     * Guard the slot's standard props before any hook runs.
     * @param props - slot standard props.
     * @returns the keybinding, or null when this slot lacks the composer hooks.
     */
    function HistoryKeys(props) {
      if (typeof props.useInput !== 'function' || typeof props.useSession !== 'function') return null
      if (props.inputActions === undefined || props.inputActions === null) return null
      if (typeof props.sessionId !== 'string' || props.sessionId === '') return null
      return h(HistoryBody, props)
    }

    /**
     * Own the history list, the browse position, and the two key bindings.
     * @param props - slot standard props.
     * @returns the hidden anchor plus, while browsing, a position counter.
     */
    function HistoryBody(props) {
      const { sessionId, useInput, useSession, inputActions } = props
      const draft = useInput((snapshot) => snapshot.draft)
      const attachmentCount = useInput((snapshot) => snapshot.attachmentIds.length)
      const phase = useInput((snapshot) => snapshot.phase)
      const running = useSession((snapshot) => snapshot.running)
      const blank = useSession((snapshot) => snapshot.blank)
      const removed = useSession((snapshot) => snapshot.removed)

      const anchorRef = React.useRef(null)
      const historyRef = React.useRef([])
      const indexRef = React.useRef(-1)
      const savedDraftRef = React.useRef('')
      const draftRef = React.useRef(draft)
      const [position, setPosition] = React.useState(null)
      draftRef.current = draft

      /* Refresh after every turn, so the message just sent is already history. */
      React.useEffect(() => {
        if (blank === true || removed === true) return undefined
        const controller = new AbortController()
        let live = true
        requestHistory(sessionId, controller.signal).then((items) => {
          if (live) historyRef.current = items
        })
        return () => {
          live = false
          controller.abort()
        }
      }, [blank, removed, running, sessionId])

      /* Any draft change that did not come from this plugin leaves browse mode. */
      React.useEffect(() => {
        const index = indexRef.current
        if (index < 0) return
        if (historyRef.current[index] === draft) return
        indexRef.current = -1
        setPosition(null)
      }, [draft])

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.isComposing) return
          if (event.altKey || event.ctrlKey || event.metaKey) return
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          if (event.defaultPrevented) return
          const dock = anchorRef.current?.closest('[data-composer-dock]')
          if (!dock) return
          const active = document.activeElement
          if (!active || active.isContentEditable !== true) return
          if (!dock.parentElement?.contains(active)) return
          if (phase !== 'plain') return

          const items = historyRef.current
          if (items.length === 0) return
          const browsing = indexRef.current >= 0

          if (event.key === 'ArrowUp') {
            /* Only an empty composer starts history: a draft or an attachment means the
             * user is writing, and ArrowUp belongs to the editor. */
            if (!browsing && (draftRef.current !== '' || attachmentCount > 0)) return
            if (!browsing) savedDraftRef.current = draftRef.current
            const next = browsing ? Math.max(0, indexRef.current - 1) : items.length - 1
            event.preventDefault()
            event.stopPropagation()
            if (next === indexRef.current) return
            indexRef.current = next
            setPosition({ index: next, total: items.length })
            inputActions.setDraft(items[next])
            return
          }

          if (!browsing) return
          event.preventDefault()
          event.stopPropagation()
          const next = indexRef.current + 1
          if (next >= items.length) {
            indexRef.current = -1
            setPosition(null)
            inputActions.setDraft(savedDraftRef.current)
            return
          }
          indexRef.current = next
          setPosition({ index: next, total: items.length })
          inputActions.setDraft(items[next])
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [attachmentCount, inputActions, phase])

      return h(
        React.Fragment,
        null,
        h('span', { ref: anchorRef, 'data-dsh-composer-history': true, style: { display: 'none' } }),
        position === null
          ? null
          : h('span', { style: COUNTER, title: '↑ ↓', 'aria-hidden': 'true' }, `${position.index + 1}/${position.total}`),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'composer-history',
              order: 4,
            },
            HistoryKeys,
          ),
        )
      },
    }
  },
})
