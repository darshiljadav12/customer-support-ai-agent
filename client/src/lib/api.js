import axios from 'axios'

// Dev & Docker: "/api" on the same origin (Vite proxies it in dev; in
// production Express serves this app and the API together).
// Split hosting (e.g. Vercel + Render): set VITE_API_URL to the API's URL.
const BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Called when a request fails with 401 outside /auth/* (session expired).
// AuthContext registers the handler.
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

export const api = axios.create({
  baseURL: BASE_URL,
  // Send/receive the httpOnly auth cookie. The JWT is never stored in JS
  // (no localStorage), so an XSS bug cannot steal it.
  withCredentials: true,
  timeout: 90_000, // free AI models can be slow
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(undefined, (error) => {
  const url = error.config?.url ?? ''
  if (error.response?.status === 401 && !url.startsWith('/auth/')) onUnauthorized()
  return Promise.reject(error)
})

/** Turns any axios error into a user-friendly message. */
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.response?.data?.error?.message) return err.response.data.error.message
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  if (err?.request && !err.response) return 'Cannot reach the server. Check your connection.'
  return fallback
}

/** Field-level validation errors from the API → { field: message } */
export function getFieldErrors(err) {
  const details = err?.response?.data?.error?.details
  if (!Array.isArray(details)) return {}
  return Object.fromEntries(details.map((d) => [d.field, d.message]))
}

export const authApi = {
  me: () => api.get('/auth/me').then((r) => r.data.user),
  login: (data) => api.post('/auth/login', data).then((r) => r.data.user),
  signup: (data) => api.post('/auth/signup', data).then((r) => r.data.user),
  logout: () => api.post('/auth/logout'),
}

/** Error shape shared with axios errors, so getErrorMessage() works for both. */
class StreamError extends Error {
  constructor(message, status) {
    super(message)
    this.response = { status, data: { error: { message } } }
  }
}

/**
 * POST /chat/send/stream and dispatch Server-Sent Events as they arrive.
 * (EventSource only supports GET, so we read the fetch body stream ourselves.)
 *
 * Resolves when the stream ends; rejects with StreamError (server/AI error),
 * TypeError (network) or AbortError (the caller aborted = "Stop").
 *
 * @param {{ message: string, conversationId?: string, signal?: AbortSignal,
 *           onMeta?: Function, onDelta?: Function, onDone?: Function,
 *           onStopped?: Function }} opts
 */
export async function streamChat({ message, conversationId, signal, onMeta, onDelta, onDone, onStopped }) {
  const res = await fetch(`${BASE_URL}/chat/send/stream`, {
    method: 'POST',
    credentials: 'include', // send the httpOnly auth cookie
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message, ...(conversationId && { conversationId }) }),
    signal,
  })

  // Errors before the stream starts come back as normal JSON.
  if (!res.ok) {
    if (res.status === 401) onUnauthorized()
    const data = await res.json().catch(() => null)
    throw new StreamError(data?.error?.message || `Request failed (${res.status})`, res.status)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let finished = false

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value

    // SSE events are separated by a blank line.
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      let event = 'message'
      let data = ''
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
        // lines starting with ":" are heartbeats → ignored
      }
      if (!data) continue
      const payload = JSON.parse(data)

      if (event === 'meta') onMeta?.(payload)
      else if (event === 'delta') onDelta?.(payload.text)
      else if (event === 'done') {
        finished = true
        onDone?.(payload)
      } else if (event === 'stopped') {
        finished = true // stopped before any text; nothing was saved
        onStopped?.()
      } else if (event === 'error') throw new StreamError(payload.message, 502)
    }
  }

  if (!finished) throw new StreamError('The connection was interrupted. Please try again.', 0)
}

// Messages are sent with streamChat(); the non-streaming POST /chat/send
// endpoint remains on the API for other clients.
export const chatApi = {
  // Ask the server to stop a running stream; it then saves exactly the text
  // it has sent and finishes the stream with a `done` event.
  stopStream: (streamId) => api.post(`/chat/stop/${streamId}`),
  history: () => api.get('/chat/history').then((r) => r.data.conversations),
  conversation: (id) => api.get(`/chat/history/${id}`).then((r) => r.data),
  remove: (id) => api.delete(`/chat/history/${id}`),
}
