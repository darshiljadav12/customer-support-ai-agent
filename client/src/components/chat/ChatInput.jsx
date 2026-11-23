import { useEffect, useRef, useState } from 'react'

const MAX = 4000

/**
 * @param onSend      (text) => void
 * @param onStop      () => void — aborts the reply being generated
 * @param generating  a reply is streaming → show Stop instead of Send
 * @param disabled    e.g. while the conversation is loading
 */
export function ChatInput({ onSend, onStop, generating, disabled, autoFocusKey }) {
  const [text, setText] = useState('')
  const ref = useRef(null)

  // Auto-grow the textarea up to ~8 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  // Focus when switching conversation and after a reply finishes.
  useEffect(() => {
    if (!disabled && !generating) ref.current?.focus()
  }, [autoFocusKey, disabled, generating])

  const canSend = !disabled && !generating && text.trim().length > 0

  function submit() {
    if (!canSend) return
    onSend(text.trim())
    setText('')
  }

  function onKeyDown(e) {
    // Enter sends, Shift+Enter inserts a newline (ignore while composing IME text).
    // While a reply is generating you can keep typing; Enter just won't send yet.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="mx-auto w-full max-w-3xl"
    >
      <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={text}
          maxLength={MAX}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe your issue…"
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
        />
        {generating ? (
          <button
            key="stop" // distinct keys → no colour transition when swapping buttons
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden="true">
              <rect x="4" y="4" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            key="send"
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-1.5 px-2 text-center text-xs text-slate-400">
        Enter to send · Shift+Enter for a new line
        {text.length > MAX - 500 && ` · ${MAX - text.length} characters left`}
      </p>
    </form>
  )
}
