import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext.jsx'
import { getErrorMessage, getFieldErrors } from '../lib/api.js'
import { AuthCard, Field, FormError, SubmitButton } from '../components/AuthCard.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setLoading(true)
    try {
      await login(form)
      // PublicOnlyRoute redirects to /chat (or the page the user came from).
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to chat with our support assistant"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          autoFocus
          value={form.email}
          onChange={onChange}
          error={fieldErrors.email}
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
        />
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>
    </AuthCard>
  )
}
