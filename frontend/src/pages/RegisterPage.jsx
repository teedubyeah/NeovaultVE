import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import MinkIcon from '../components/MinkIcon'
import EncryptionWarning from '../components/EncryptionWarning'

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // pendingSession holds the token+user+password after a successful register call,
  // waiting for the user to acknowledge the encryption warning before entering the app.
  const [pendingSession, setPendingSession] = useState(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  function passwordStrength(p) {
    if (!p) return null
    if (p.length < 12) return { level: 'weak', label: 'Too short (min 12)' }
    let score = 0
    if (/[A-Z]/.test(p)) score++
    if (/[a-z]/.test(p)) score++
    if (/[0-9]/.test(p)) score++
    if (/[^A-Za-z0-9]/.test(p)) score++
    if (score <= 2) return { level: 'weak',   label: 'Weak' }
    if (score === 3) return { level: 'medium', label: 'Good' }
    return { level: 'strong', label: 'Strong' }
  }

  const strength = passwordStrength(form.password)
  const strengthColors = { weak: 'var(--red)', medium: 'var(--yellow)', strong: 'var(--green)' }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) return setError('Passwords do not match')
    if (form.password.length < 12) return setError('Password must be at least 12 characters')
    setError(''); setLoading(true)
    try {
      const { username, email, password } = form
      const data = await auth.register({ username, email, password })
      // Don't log in yet — show the encryption warning first
      setPendingSession({ token: data.token, user: data.user, password })
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  function handleAcknowledged() {
    const { token, user, password } = pendingSession
    login(token, user, password)
    navigate('/')
  }

  // Show the full-screen warning once registration succeeds
  if (pendingSession) {
    return (
      <EncryptionWarning
        username={pendingSession.user.username}
        onAcknowledged={handleAcknowledged}
      />
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-icon"><MinkIcon size={24} /></div>
          <div className="auth-logo-text">Neovision<span>VE</span></div>
        </div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Your password encrypts your notes. Choose wisely.</p>

        {error && <div className="error-msg">⚠ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" type="text" autoComplete="username"
              placeholder="your_username" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" autoComplete="email"
              placeholder="you@example.com" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Password</span>
              {strength && <span style={{ color: strengthColors[strength.level] }}>{strength.label}</span>}
            </label>
            <input className="form-input" type="password" autoComplete="new-password"
              placeholder="Minimum 12 characters" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="form-input" type="password" autoComplete="new-password"
              placeholder="Repeat your password" value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating vault…' : 'Create account'}
          </button>
        </form>

        <div className="security-badge">
          <span>🛡</span>
          <span>Password never stored · Argon2id · AES-256-GCM</span>
        </div>

        <div className="auth-footer">
          <p>Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  )
}
