import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import MinkIcon from '../components/MinkIcon'

const SECURITY_FEATURES = [
  {
    icon: '🔐',
    title: 'AES-256-GCM Encryption',
    detail: 'Every note title, body, label, color, bookmark URL, and folder name is individually encrypted with AES-256 in Galois/Counter Mode — the same cipher used by governments and financial institutions. GCM provides both confidentiality and built-in integrity verification, so tampered ciphertext is detected and rejected.',
  },
  {
    icon: '🧂',
    title: 'Argon2id Password Hashing',
    detail: 'Passwords are hashed with Argon2id — the winner of the Password Hashing Competition and the current OWASP recommendation. It is intentionally slow and memory-hard, making GPU and ASIC brute-force attacks economically infeasible. Parameters: 64 MB memory, 3 iterations, 4 threads.',
  },
  {
    icon: '🔑',
    title: 'Zero-Knowledge Architecture',
    detail: 'Your encryption key is never stored anywhere on the server — not in the database, not in logs, not in memory between requests. It is derived fresh on every request from your password + a secret server pepper + your personal salt using PBKDF2-SHA256 (310,000 iterations). Only you can decrypt your data.',
  },
  {
    icon: '🧱',
    title: 'Per-Item Unique IVs',
    detail: 'Each note and bookmark gets a cryptographically random 128-bit initialisation vector (IV) generated at creation and on every update. IVs are never reused. GCM authentication tags are stored alongside ciphertext, ensuring every encrypted field\'s integrity can be independently verified.',
  },
  {
    icon: '🔗',
    title: 'Encrypted Sharing',
    detail: 'Shared items are re-encrypted with a random one-time key that is embedded in the share link — never stored on the server. Even if the database is compromised, shared content cannot be read without the link. Recipients re-encrypt the content with their own key when they accept.',
  },
  {
    icon: '🛡',
    title: 'Security Headers & Rate Limiting',
    detail: 'All responses include Helmet.js security headers: Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, and a restrictive Content-Security-Policy. Authentication endpoints are rate-limited to 20 requests per 15 minutes per IP to mitigate credential stuffing.',
  },
  {
    icon: '🗄',
    title: 'Hardened Database',
    detail: 'SQLite runs in WAL mode with secure_delete=ON, which overwrites deleted data with zeros rather than leaving it recoverable in free pages. Foreign keys are enforced. All user data is cascade-deleted on account removal.',
  },
  {
    icon: '🌐',
    title: 'Self-Hosted & Open',
    detail: 'There is no cloud backend, no analytics, no telemetry, and no third-party data processors. You run the server, you own the data. The source code is fully auditable. Recommended deployment is behind a reverse proxy with TLS (Caddy or nginx) on your own hardware or private VPS.',
  },
]

function FeatureCard({ icon, title, detail }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onClick={() => setOpen(v => !v)}
      style={{
        background: open ? 'rgba(153,184,152,0.07)' : 'rgba(0,0,0,0.15)',
        border: `1px solid ${open ? 'rgba(153,184,152,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
        transition: 'all 0.18s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 17, flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: open ? 'var(--sage)' : 'var(--text2)', transition: 'color 0.15s' }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>
          {detail}
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  const [form,    setForm]    = useState({ username: '', password: '' })
  const [error,   setError]   = useState('')
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 900, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start' }}>

        {/* ── Left: login form ───────────────────────────────────────── */}
        <div>
          <div className="auth-logo" style={{ marginBottom: 28 }}>
            <div className="auth-logo-icon"><MinkIcon size={24} /></div>
            <div className="auth-logo-text">Neovision<span>VE</span></div>
          </div>

          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Your encrypted vault is waiting.</p>

          {error && <div className="error-msg">⚠ {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" type="text" autoComplete="username" autoFocus
                placeholder="your_username" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" autoComplete="current-password"
                placeholder="••••••••••••" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Unlocking vault…' : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(153,184,152,0.07)', border: '1px solid rgba(153,184,152,0.2)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 15 }}>🔒</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sage)', letterSpacing: '0.5px' }}>END-TO-END ENCRYPTED</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, margin: 0 }}>
              Your password never leaves your browser in plaintext. All content is encrypted before storage.
              The server never sees your notes, bookmarks, or decryption key.
            </p>
          </div>

          <div className="auth-footer" style={{ marginTop: 20 }}>
            <p>No account? <Link to="/register">Create one</Link></p>
          </div>
        </div>

        {/* ── Right: security features ───────────────────────────────── */}
        <div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 6 }}>
              Security Architecture
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, margin: 0 }}>
              Built for paranoid privacy
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 }}>
              NeovisionVE is a zero-knowledge, self-hosted vault. Tap any feature below to learn how it protects your data.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {SECURITY_FEATURES.map(f => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>

          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(232,74,95,0.05)', border: '1px solid rgba(232,74,95,0.15)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            ⚠ <strong style={{ color: 'var(--rose)' }}>Remember:</strong> If you forget your password, your data cannot be recovered by anyone — including the administrator. There is no password recovery by design.
          </div>
        </div>
      </div>
    </div>
  )
}
