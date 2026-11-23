/** Three bouncing dots, shown inside the assistant bubble until the first token. */
export function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1" role="status">
      <span className="typing-dot size-2 rounded-full bg-slate-400" />
      <span className="typing-dot size-2 rounded-full bg-slate-400" />
      <span className="typing-dot size-2 rounded-full bg-slate-400" />
      <span className="sr-only">Assistant is typing…</span>
    </span>
  )
}
