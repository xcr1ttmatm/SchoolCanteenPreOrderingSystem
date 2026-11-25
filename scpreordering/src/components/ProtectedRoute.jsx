import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { homeFor } from '../lib/routes'

export default function ProtectedRoute() {
  const { session, profile, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="hard-card auth-card">
          <span className="tiny-label">SPC Canteen</span>
          <p className="section-title mt-8">Opening the canteen…</p>
          <p className="muted">Just a moment while we check your account.</p>
        </div>
      </div>
    )
  }

  if (profile?.is_active === false) {
    return (
      <div className="auth-wrap">
        <div className="hard-card auth-card">
          <span className="tiny-label">SPC Canteen · Access</span>
          <h1 className="greeting mt-8">Access revoked.</h1>
          <p className="status-line">
            An administrator has turned off this account. Ask the admin to activate it again.
          </p>
          <button type="button" className="btn btn-primary mt-16" onClick={signOut}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <Outlet />
}

export function RequireRole({ allow }) {
  const { profile } = useAuth()
  if (!profile) return null
  if (!allow.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />
  return <Outlet />
}
