import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { FullPageSpinner, ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'

// Chat (with the markdown renderer) is split into its own chunk, so the
// login page loads fast.
const ChatPage = lazy(() => import('./pages/ChatPage.jsx'))

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          {/* One route with an optional param → ChatPage stays mounted when switching conversations */}
          <Route path="/chat/:conversationId?" element={<ChatPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Suspense>
  )
}
