import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext.jsx'
import { getErrorMessage, getFieldErrors } from '../lib/api.js'
import { AuthCard, Field, FormError, SubmitButton } from '../components/AuthCard.jsx'

export default function SignupPage() {
  const { signup } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    // Quick client-side checks (the API validates everything again).
    const errs = {}
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) errs.confirm = 'Passwords do not match'
    setFieldErrors(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    try {
      await signup({ name: form.name, email: form.email, password: form.password })
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Get instant help from our AI support assistant"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field
          id="name"
          name="name"
          label="Full name"
          autoComplete="name"
          required
          autoFocus
          value={form.name}
          onChange={onChange}
          error={fieldErrors.name}
        />
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          value={form.email}
          onChange={onChange}
          error={fieldErrors.email}
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
        />
        <Field
          id="confirm"
          name="confirm"
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={onChange}
          error={fieldErrors.confirm}
        />
        <SubmitButton loading={loading}>Create account</SubmitButton>
      </form>
    </AuthCard>
  )
}
