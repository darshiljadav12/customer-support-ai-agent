import { Logo } from '../Logo.jsx'

const SUGGESTIONS = [
  'My order hasn’t arrived yet. What should I do?',
  'How do I reset my password?',
  'I was charged twice for the same order.',
  'How can I return a product?',
]

export function EmptyState({ name, onPick, disabled }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12 text-center">
      <Logo className="size-14" />
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">Hi{name ? ` ${name.split(' ')[0]}` : ''}, how can we help?</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Ask our AI support assistant anything about your orders, account or billing.
      </p>
      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 shadow-xs transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
