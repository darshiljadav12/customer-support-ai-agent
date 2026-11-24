import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../context/AuthContext.jsx'
import { chatApi, getErrorMessage, streamChat } from '../lib/api.js'
import { createTypewriter } from '../lib/typewriter.js'
import { Sidebar } from '../components/chat/Sidebar.jsx'
import { MessageBubble } from '../components/chat/MessageBubble.jsx'
import { ChatInput } from '../components/chat/ChatInput.jsx'
import { EmptyState } from '../components/chat/EmptyState.jsx'

const NEW = 'new' // key used for a conversation that doesn't exist yet
const NO_MESSAGES = [] // stable reference → effects don't re-run every render

/** Appends messages, skipping any whose id is already present. */
const mergeMessages = (list, incoming) => {
  const ids = new Set(list.map((m) => m.id))
  return [...list, ...incoming.filter((m) => !ids.has(m.id))]
}

export default function ChatPage() {
  const { conversationId } = useParams()
  const activeId = conversationId ?? null
  const activeKey = activeId ?? NEW
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [conversations, setConversations] = useState([])
  const [convLoading, setConvLoading] = useState(true)
  const [convError, setConvError] = useState('')

  // The messages on screen, tagged with the conversation they belong to.
  // Tagging (instead of resetting state on navigation) means a slow response
  // for conversation A can never end up displayed inside conversation B.
  const [thread, setThread] = useState({ key: null, messages: [], error: '' })

  // Which conversation is waiting for / streaming an AI reply.
  const [sendingKey, setSendingKey] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // The in-flight stream: { controller, streamId, stopping, typewriter } — used by "Stop".
  const streamRef = useRef(null)
  const activeKeyRef = useRef(activeKey) // current view, for async callbacks
  const scrollRef = useRef(null)
  const stickToBottomRef = useRef(true) // auto-scroll only if the user hasn't scrolled up

  useEffect(() => {
    activeKeyRef.current = activeKey
    stickToBottomRef.current = true
  }, [activeKey])

  // Stop any running stream when leaving the page (e.g. logout).
  useEffect(() => () => streamRef.current?.controller.abort(), [])

  // Derived view state for the active conversation.
  const isCurrent = thread.key === activeKey
  const messages = isCurrent ? thread.messages : NO_MESSAGES
  const messagesError = isCurrent ? thread.error : ''
  const messagesLoading = activeId !== null && !isCurrent

  // ---- Load the sidebar list once ----------------------------------------
  useEffect(() => {
    chatApi
      .history()
      .then(setConversations)
      .catch((err) => setConvError(getErrorMessage(err, 'Could not load conversations')))
      .finally(() => setConvLoading(false))
  }, [])

  // ---- Load messages whenever the selected conversation changes ----------
  // Skipped when the thread is already in memory, e.g. right after we created it.
  const loadedKey = thread.key
  useEffect(() => {
    if (!activeId || loadedKey === activeId) return

    let ignore = false // drop stale responses when switching quickly
    chatApi
      .conversation(activeId)
      .then((data) => !ignore && setThread({ key: activeId, messages: data.messages, error: '' }))
      .catch((err) => {
        if (ignore) return
        const error =
          err.response?.status === 404 ? 'This conversation does not exist or was deleted.' : getErrorMessage(err)
        setThread({ key: activeId, messages: [], error })
      })
    return () => {
      ignore = true
    }
  }, [activeId, loadedKey])

  // ---- Keep the newest text in view while it streams ----------------------
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // ---- Send a message (streamed) -------------------------------------------
  const send = useCallback(
    async (text, retryOfId) => {
      const key = activeId ?? NEW
      const stamp = Date.now()
      const userTempId = `temp-u-${stamp}`
      const botTempId = `temp-a-${stamp}`
      const now = new Date().toISOString()

      // Optimistic UI: the user's message + an empty assistant bubble that
      // shows the typing indicator until the first token arrives.
      setThread((t) => ({
        key,
        error: '',
        messages: [
          ...(t.key === key ? t.messages.filter((m) => m.id !== retryOfId) : []),
          { id: userTempId, role: 'user', content: text, createdAt: now, pending: true },
          { id: botTempId, role: 'assistant', content: '', createdAt: now, streaming: true },
        ],
      }))
      setSendingKey(key)
      stickToBottomRef.current = true

      const controller = new AbortController()

      // Only touch the thread if it's still the one this message was sent from.
      const updateMessages = (fn) => setThread((t) => (t.key === key ? { ...t, messages: fn(t.messages) } : t))

      // Called once the server has saved the exchange (completed or stopped).
      const settle = (conversation, fn) => {
        const rekey = () =>
          setThread((t) => (t.key === key ? { key: conversation.id, error: '', messages: fn(t.messages) } : t))

        if (key === NEW && activeKeyRef.current === NEW) {
          // New conversation → move to its URL. React Router navigates inside a
          // transition, so the thread re-key must be in the same transition;
          // otherwise an intermediate render (thread = new id, URL still /chat)
          // briefly unmounts the message list and the bubble re-animates.
          startTransition(() => {
            rekey()
            navigate(`/chat/${conversation.id}`, { replace: true })
          })
        } else {
          rekey()
        }
        setConversations((list) => [conversation, ...list.filter((c) => c.id !== conversation.id)])
      }
      const markFailed = (error) =>
        updateMessages((list) =>
          list
            .filter((m) => m.id !== botTempId)
            .map((m) => (m.id === userTempId ? { ...m, pending: false, failed: true, error } : m)),
        )

      let conversation = null
      let received = ''
      let doneData = null
      let stoppedEmpty = false

      // Network chunks go into the typewriter, which reveals them smoothly
      // (one state update per animation frame at most).
      const typewriter = createTypewriter((visible) =>
        updateMessages((list) => list.map((m) => (m.id === botTempId ? { ...m, content: visible } : m))),
      )
      // Connection cut → immediately show everything received.
      controller.signal.addEventListener('abort', () => typewriter.flush(), { once: true })

      const stream = { controller, streamId: null, stopping: false, typewriter }
      streamRef.current = stream

      try {
        await streamChat({
          message: text,
          conversationId: activeId,
          signal: controller.signal,
          onMeta: (data) => {
            conversation = data.conversation
            stream.streamId = data.streamId
          },
          onDelta: (delta) => {
            received += delta
            typewriter.push(delta)
            if (stream.stopping) typewriter.flush() // after Stop: no more animation
          },
          onDone: (data) => {
            doneData = data
          },
          onStopped: () => {
            stoppedEmpty = true
          },
        })

        if (stoppedEmpty) {
          markFailed('Stopped before the assistant replied.') // server saved nothing
          return
        }

        // Let the typewriter finish revealing, then swap in the saved messages.
        // `clientKey` keeps the React key stable → no remount / flicker.
        await typewriter.finish()
        settle(doneData.conversation, (list) =>
          mergeMessages(
            list.filter((m) => m.id !== userTempId && m.id !== botTempId),
            [
              { ...doneData.userMessage, clientKey: userTempId },
              { ...doneData.reply, clientKey: botTempId },
            ],
          ),
        )
      } catch (err) {
        if (err.name === 'AbortError') {
          // Fallback path: the connection was cut (Stop request failed or timed
          // out, or the page is closing).
          if (conversation && received.trim()) {
            // The server keeps the partial answer (stopped: true).
            settle({ ...conversation, lastMessageAt: new Date().toISOString() }, (list) =>
              list.map((m) => {
                if (m.id === userTempId) return { ...m, pending: false }
                if (m.id === botTempId) return { ...m, streaming: false, stopped: true }
                return m
              }),
            )
          } else {
            markFailed('Stopped before the assistant replied.') // nothing was saved
          }
        } else {
          typewriter.cancel()
          markFailed(getErrorMessage(err)) // AI/network error: nothing was saved
        }
      } finally {
        if (streamRef.current === stream) streamRef.current = null
        setSendingKey(null)
      }
    },
    [activeId, navigate],
  )

  // Stop: ask the server to stop and keep reading — it saves exactly the text
  // it has sent and confirms with `done`, so screen and database match.
  // Falls back to cutting the connection if that doesn't work.
  const stop = useCallback(() => {
    const stream = streamRef.current
    if (!stream || stream.stopping) return
    stream.stopping = true
    stream.typewriter.flush() // show everything received so far, right away

    if (!stream.streamId) {
      stream.controller.abort() // stream not started yet → nothing to keep
      return
    }
    chatApi.stopStream(stream.streamId).catch(() => stream.controller.abort())
    // Safety net: no confirmation from the server → cut the connection.
    setTimeout(() => {
      if (streamRef.current === stream) stream.controller.abort()
    }, 10_000)
  }, [])
  const retry = useCallback((message) => send(message.content, message.id), [send])

  // ---- Sidebar actions -----------------------------------------------------
  const newChat = () => {
    setSidebarOpen(false)
    navigate('/chat')
  }

  const deleteConversation = async (c) => {
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return
    try {
      await chatApi.remove(c.id)
      setConversations((list) => list.filter((x) => x.id !== c.id))
      if (c.id === activeId) navigate('/chat', { replace: true })
    } catch (err) {
      window.alert(getErrorMessage(err, 'Could not delete the conversation'))
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeId)
  const busy = sendingKey !== null

  const sidebar = (
    <Sidebar
      user={user}
      conversations={conversations}
      loading={convLoading}
      error={convError}
      activeId={activeId}
      onNewChat={newChat}
      onDelete={deleteConversation}
      onLogout={logout}
      onNavigate={() => setSidebarOpen(false)}
    />
  )

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 md:block dark:border-slate-800">{sidebar}</aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">{sidebar}</aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <button
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Open conversations"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <h1 className="truncate text-sm font-semibold">{activeConversation?.title ?? 'New conversation'}</h1>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            AI assistant online
          </span>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
          {messagesLoading ? (
            <div className="flex h-full items-center justify-center" role="status" aria-label="Loading messages">
              <div className="size-7 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : messagesError ? (
            <div className="mx-auto max-w-md px-4 py-16 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">{messagesError}</p>
              <Link to="/chat" className="mt-4 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                Start a new conversation
              </Link>
            </div>
          ) : messages.length === 0 ? (
            <EmptyState name={user?.name} onPick={(s) => send(s)} disabled={busy} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
              {messages.map((m) => (
                <MessageBubble key={m.clientKey ?? m.id} message={m} onRetry={retry} />
              ))}
            </div>
          )}
        </div>

        {!messagesError && (
          <div className="shrink-0 px-4 pb-3 pt-2">
            <ChatInput
              onSend={send}
              onStop={stop}
              generating={busy}
              disabled={messagesLoading}
              autoFocusKey={activeKey}
            />
          </div>
        )}
      </main>
    </div>
  )
}
