import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Logo } from '../Logo.jsx'
import { TypingDots } from './TypingIndicator.jsx'

const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const remarkPlugins = [remarkGfm]
const markdownComponents = {
  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

// memo: while a reply streams, only the streaming bubble re-renders —
// every other message keeps the same object reference and is skipped.
export const MessageBubble = memo(function MessageBubble({ message, onRetry }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="message-enter flex flex-col items-end">
        <div
          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-4 py-2.5 text-sm shadow-sm transition-colors sm:max-w-[75%] ${
            message.failed ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100' : 'bg-indigo-600 text-white'
          }`}
        >
          {message.content}
        </div>
        {/* Fixed-height footer → no layout shift when the timestamp appears */}
        <div className="mt-1 flex h-4 items-center gap-2 text-xs">
          {message.failed ? (
            <span className="flex items-center gap-2 text-red-600 dark:text-red-400" role="alert">
              {message.error}
              <button onClick={() => onRetry(message)} className="font-semibold underline underline-offset-2 hover:no-underline">
                Retry
              </button>
            </span>
          ) : (
            <span className={`text-slate-400 transition-opacity duration-300 ${message.pending ? 'opacity-0' : 'opacity-100'}`}>
              {time(message.createdAt)}
            </span>
          )}
        </div>
      </div>
    )
  }

  const waiting = message.streaming && !message.content

  // One bubble from start to finish: it shows the typing dots, then grows
  // smoothly as text is revealed — no element swap, no flicker.
  return (
    <div className="message-enter flex gap-3">
      <Logo className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 max-w-[85%] sm:max-w-[75%]">
        <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {waiting ? (
            <TypingDots />
          ) : (
            <div
              className={`prose prose-sm prose-slate max-w-none break-words dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 ${
                message.streaming ? 'streaming-cursor' : ''
              }`}
              aria-busy={message.streaming || undefined}
            >
              <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
                {message.content}
              </Markdown>
            </div>
          )}
        </div>
        <div className="mt-1 flex h-4 items-center gap-2 text-xs text-slate-400">
          <span className={`transition-opacity duration-300 ${message.streaming ? 'opacity-0' : 'opacity-100'}`}>
            {time(message.createdAt)}
          </span>
          {message.stopped && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Stopped
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
