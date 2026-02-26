import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { account, setSessionPassword } from '../utils/api'
import MinkIcon from '../components/MinkIcon'

export default function ChangePasswordPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ new_password: '', confirm_password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

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

  const strength = passwordStrength(form.new_password)
  const strengthColors = { weak: 'var(--red)', medium: 'var(--yellow)', strong: 'var(--green)' }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.new_password !== form.confirm_password) {
      return setError('Passwords do not match')
    }
    if (form.new_password.length < 12) {
      return setError('Password must be at least 12 characters')
    }
    setError(''); setLoading(true)
    try {
      const data = await account.changePassword({
        new_password: form.new_password,
        confirm_password: form.confirm_password,
      })
      // Update the in-memory session password so subsequent requests use the new key
      setSessionPassword(form.new_password)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Password change failed')
    } finally {
      setLoading(false)
    }
  }

  // After success, force a full logout so the user logs back in fresh
  function handleDone() {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><MinkIcon size={18} /></div>
          <span className="topbar-logo-text">Neovision<span>VE</span></span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/" className="btn btn-ghost btn-sm">← Back to notes</Link>
          <div className="user-chip">
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <span>{user?.username}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div style={{ maxWidth: 520, margin: '40px auto' }}>

          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Change Password
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.6 }}>
              Your current session password is used to decrypt and re-encrypt all your notes.
              This happens atomically — if anything fails, nothing changes.
            </p>
          </div>

          {/* How it works */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '18px 20px', marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
              What happens when you change your password
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: '🔓', text: 'Your current session key decrypts every one of your notes.' },
                { icon: '🔑', text: 'A new encryption key is generated from your new password.' },
                { icon: '🔒', text: 'All notes are re-encrypted with the new key in a single database transaction.' },
                { icon: '✓',  text: 'Only if all notes re-encrypt successfully is your password updated.' },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div style={{
            background: 'rgba(232,74,95,0.07)',
            border: '1px solid rgba(232,74,95,0.3)',
            borderLeft: '4px solid var(--rose)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 28,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--rose)', marginBottom: 6 }}>
              ⚠ Remember
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              After changing your password you will be signed out and must log back in with the new one.
              There is still no way to recover notes if you forget your new password —
              store it somewhere safe before continuing.
            </p>
          </div>

          {/* Success state */}
          {result ? (
            <div style={{
              background: 'rgba(153,184,152,0.08)',
              border: '1px solid rgba(153,184,152,0.35)',
              borderRadius: 12, padding: '28px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                Password changed successfully
              </div>
              <p style={{ fontSize: 14, color: 'var(--sage)', marginBottom: 6 }}>
                {result.notes_reencrypted} note{result.notes_reencrypted !== 1 ? 's' : ''} re-encrypted with your new password.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, lineHeight: 1.6 }}>
                You will now be signed out. Log back in with your new password.
              </p>
              <button className="btn btn-primary" style={{ maxWidth: 260, margin: '0 auto' }} onClick={handleDone}>
                Sign out and log back in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px' }}>

              {error && <div className="error-msg">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>New Password</span>
                  {strength && <span style={{ color: strengthColors[strength.level] }}>{strength.label}</span>}
                </label>
                <input className="form-input" type="password" autoComplete="new-password"
                  placeholder="Minimum 12 characters"
                  value={form.new_password}
                  onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} required />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" autoComplete="new-password"
                  placeholder="Repeat your new password"
                  value={form.confirm_password}
                  onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))} required />
              </div>

              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Re-encrypting notes…' : 'Change password & re-encrypt notes'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
