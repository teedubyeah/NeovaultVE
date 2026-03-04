import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { account } from '../utils/api'
import MinkIcon from '../components/MinkIcon'

export default function ClearDataPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [step,     setStep]     = useState(1)   // 1 = warning, 2 = confirm, 3 = done
  const [checks,   setChecks]   = useState({ c1: false, c2: false, c3: false })
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState(null)

  const allChecked = Object.values(checks).every(Boolean)

  async function handleClear() {
    if (!password.trim()) return setError('Password is required')
    setError(''); setLoading(true)
    try {
      const data = await account.clearData({ password })
      setResult(data)
      setStep(3)
    } catch (err) {
      setError(err.message || 'Failed to clear data')
    } finally {
      setLoading(false)
    }
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

          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Clear My Data
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.6 }}>
              Permanently delete all notes, bookmarks, and folders from your account.
              Your account itself will remain active.
            </p>
          </div>

          {step === 3 ? (
            /* ── Done ── */
            <div style={{ background: 'rgba(153,184,152,0.08)', border: '1px solid rgba(153,184,152,0.35)',
              borderRadius: 12, padding: '32px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
                Vault cleared
              </div>
              <div style={{ fontSize: 14, color: 'var(--sage)', marginBottom: 6 }}>
                {result?.deleted?.notes || 0} notes · {result?.deleted?.bookmarks || 0} bookmarks · {result?.deleted?.folders || 0} folders deleted
              </div>
              <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, lineHeight: 1.6 }}>
                All encrypted data has been permanently removed from the server.
              </p>
              <Link to="/" className="btn btn-primary" style={{ display: 'inline-block', width: 'auto' }}>
                Go to my vault
              </Link>
            </div>

          ) : step === 1 ? (
            /* ── Step 1: Warning + checkboxes ── */
            <>
              <div style={{ background: 'rgba(232,74,95,0.07)', border: '1px solid rgba(232,74,95,0.3)',
                borderLeft: '4px solid var(--rose)', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--rose)', marginBottom: 8 }}>
                  ⚠ This cannot be undone
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>
                  All notes, bookmarks, and bookmark folders will be <strong style={{ color: 'var(--rose)' }}>permanently deleted</strong>.
                  Because your data is encrypted with your password and never stored in plaintext,
                  there is absolutely no way to recover it once deleted — not by you, not by an administrator.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {[
                  { key: 'c1', text: 'I understand this will permanently delete all my notes and bookmarks.' },
                  { key: 'c2', text: 'I understand this action cannot be reversed by anyone.' },
                  { key: 'c3', text: 'I have saved anything I need before continuing.' },
                ].map(({ key, text }) => (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                    padding: '10px 14px',
                    background: checks[key] ? 'rgba(153,184,152,0.07)' : 'rgba(0,0,0,0.1)',
                    border: `1px solid ${checks[key] ? 'rgba(153,184,152,0.3)' : 'var(--border)'}`,
                    borderRadius: 8, transition: 'all 0.15s',
                  }}>
                    <input type="checkbox" checked={checks[key]}
                      onChange={() => setChecks(c => ({ ...c, [key]: !c[key] }))}
                      style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0, accentColor: 'var(--sage)', cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, color: checks[key] ? 'var(--text)' : 'var(--text2)', lineHeight: 1.5, transition: 'color 0.15s' }}>
                      {text}
                    </span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <Link to="/" className="btn btn-ghost" style={{ flex: 1 }}>Cancel</Link>
                <button className="btn btn-danger" style={{ flex: 1, opacity: allChecked ? 1 : 0.4, transition: 'opacity 0.2s' }}
                  disabled={!allChecked} onClick={() => setStep(2)}>
                  Continue →
                </button>
              </div>
            </>

          ) : (
            /* ── Step 2: Password confirmation ── */
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Confirm with your password
                </div>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, margin: 0 }}>
                  Enter your current password to authorise this deletion.
                </p>
              </div>

              {error && <div className="error-msg">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" autoComplete="current-password"
                  placeholder="Your current password" value={password} autoFocus
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && handleClear()} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setStep(1); setError('') }}>
                  ← Back
                </button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleClear} disabled={loading || !password}>
                  {loading ? 'Deleting…' : '🗑 Delete all my data'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
