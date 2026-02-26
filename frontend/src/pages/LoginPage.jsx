import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import MinkIcon from '../components/MinkIcon'

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const data = await auth.login(form)
      login(data.token, data.user, form.password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <MinkIcon size={24} />
          </div>
          <div className="auth-logo-text">Neovision<span>VE</span></div>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Your notes are encrypted and waiting.</p>

        {error && <div className="error-msg">⚠ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" type="text" autoComplete="username"
              placeholder="your_username" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" autoComplete="current-password"
              placeholder="••••••••••••" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Unlocking vault…' : 'Sign in'}
          </button>
        </form>

        <div className="security-badge">
          <span>🛡</span>
          <span>AES-256-GCM encrypted · Zero-knowledge storage</span>
        </div>

        <div className="auth-footer">
          <p>No account? <Link to="/register">Create one</Link></p>
        </div>
      </div>
    </div>
  )
}
