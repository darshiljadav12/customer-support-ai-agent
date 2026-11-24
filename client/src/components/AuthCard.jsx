import { useState } from 'react'
import { Logo } from './Logo.jsx'

export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {children}
        </div>
        {footer && <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</p>}
      </div>
    </main>
  )
}

/**
 * Labelled input with error message.
 * @param trailing  optional element shown inside the input on the right (e.g. a button)
 */
export function Field({ label, error, id, trailing, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-invalid:border-red-500 dark:border-slate-700 dark:bg-slate-950 ${
            trailing ? 'pr-10' : ''
          }`}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/** Password input with an eye button to show / hide the value. */
export function PasswordField(props) {
  const [visible, setVisible] = useState(false)

  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button" // never submits the form
          onClick={() => setVisible((v) => !v)}
          // Keep focus (and the caret position) in the input when clicking.
          onMouseDown={(e) => e.preventDefault()}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={props.id}
          title={visible ? 'Hide password' : 'Show password'}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          {visible ? <EyeSlashIcon /> : <EyeIcon />}
        </button>
      }
    />
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path
        fillRule="evenodd"
        d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z"
        clipRule="evenodd"
      />
      <path d="m10.748 13.93 2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  )
}

export function SubmitButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  )
}

export function FormError({ message }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
      {message}
    </div>
  )
}
