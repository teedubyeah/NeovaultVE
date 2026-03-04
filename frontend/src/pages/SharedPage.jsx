import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { shareApi } from '../utils/api'
import MinkIcon from '../components/MinkIcon'

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function timeLeft(expiresAt) {
  if (!expiresAt) return null
  const days = Math.ceil((expiresAt - Date.now() / 1000) / 86400)
  if (days <= 0) return 'Expired'
  if (days === 1) return 'Expires tomorrow'
  return `Expires in ${days} days`
}

export default function SharedPage() {
  const { user, logout, isAdmin } = useAuth()
  const [tab,      setTab]      = useState('received')
  const [sent,     setSent]     = useState([])
  const [received, setReceived] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState(null)

  function showToast(msg, err = false) { setToast({ msg, err }); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    Promise.all([shareApi.sent(), shareApi.received()])
      .then(([s, r]) => { setSent(s.shares); setReceived(r.shares) })
      .catch(e => showToast(e.message, true))
      .finally(() => setLoading(false))
  }, [])

  async function handleRevoke(shareId) {
    try {
      await shareApi.revoke(shareId)
      setSent(prev => prev.filter(s => s.id !== shareId))
      showToast('Share revoked')
    } catch (e) { showToast(e.message, true) }
  }

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><MinkIcon size={18} /></div>
          <span className="topbar-logo-text">Neovision<span>VE</span></span>
        </div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          <Link to="/" style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none', color: 'var(--text3)' }}>📝 Notes</Link>
          <Link to="/bookmarks" style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none', color: 'var(--text3)' }}>🔖 Bookmarks</Link>
          <div style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--bg2)', color: 'var(--coral)', border: '1px solid var(--border2)' }}>🔗 Shared</div>
        </div>

        <div style={{ flex: 1 }} />

        <div className="topbar-actions">
          {isAdmin && <Link to="/admin" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>⚙ Admin</Link>}
          <div className="user-chip">
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <span>{user?.username}</span>
          </div>
          <button className="btn-icon" title="Sign out" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <main className="main-content">
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Shared Items
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 28, lineHeight: 1.6 }}>
            Notes and bookmarks shared with you, or shared by you with others.
          </p>

          <div className="tab-bar" style={{ marginBottom: 0 }}>
            <button className={`tab ${tab === 'received' ? 'active' : ''}`} onClick={() => setTab('received')}>
              Received {received.length > 0 && `(${received.length})`}
            </button>
            <button className={`tab ${tab === 'sent' ? 'active' : ''}`} onClick={() => setTab('sent')}>
              Sent {sent.length > 0 && `(${sent.length})`}
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13 }}>
              Loading…
            </div>
          ) : tab === 'received' ? (
            received.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🔗</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 16, marginBottom: 6 }}>Nothing shared with you yet</div>
                <div style={{ fontSize: 13 }}>When someone shares a note or bookmark with you, it will appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                {received.map(s => (
                  <div key={s.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--coral), var(--rose))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      {s.item_type === 'note' ? '📝' : '🔖'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                        From <span style={{ color: 'var(--coral)' }}>{s.owner_username}</span>
                        <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 6, fontSize: 12 }}>· {s.item_type}</span>
                      </div>
                      {s.message && (
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, fontStyle: 'italic' }}>"{s.message}"</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10 }}>
                        <span>Received {formatDate(s.created_at)}</span>
                        {s.expires_at && <span style={{ color: 'var(--peach)' }}>{timeLeft(s.expires_at)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {s.accepted ? (
                        <span style={{ fontSize: 11, color: 'var(--sage)', padding: '4px 10px',
                          background: 'rgba(153,184,152,0.1)', border: '1px solid rgba(153,184,152,0.25)', borderRadius: 6 }}>
                          ✓ In vault
                        </span>
                      ) : (
                        <Link to={`/accept-share?token=MISSING`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none', fontSize: 12, width: 'auto' }}>
                          View →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            sent.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📤</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 16, marginBottom: 6 }}>You haven't shared anything yet</div>
                <div style={{ fontSize: 13 }}>Use the share button on any note or bookmark to send it to someone.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                {sent.map(s => (
                  <div key={s.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--sage), #6a9e6a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      {s.item_type === 'note' ? '📝' : '🔖'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                        Shared with <span style={{ color: 'var(--sage)' }}>{s.recipient_email}</span>
                        <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 6, fontSize: 12 }}>· {s.item_type}</span>
                      </div>
                      {s.message && (
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, fontStyle: 'italic' }}>"{s.message}"</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10 }}>
                        <span>Sent {formatDate(s.created_at)}</span>
                        <span style={{
                          padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          background: s.accepted ? 'rgba(153,184,152,0.12)' : 'rgba(254,206,171,0.12)',
                          color: s.accepted ? 'var(--sage)' : 'var(--peach)',
                          border: `1px solid ${s.accepted ? 'rgba(153,184,152,0.25)' : 'rgba(254,206,171,0.25)'}`,
                        }}>
                          {s.accepted ? '✓ Accepted' : '⏳ Pending'}
                        </span>
                        {s.expires_at && <span style={{ color: 'var(--peach)' }}>{timeLeft(s.expires_at)}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleRevoke(s.id)}
                      style={{ flexShrink: 0, background: 'none', border: '1px solid rgba(232,74,95,0.3)',
                        color: 'var(--rose)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                        fontSize: 12, fontFamily: 'var(--font)' }}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.err ? 'var(--rose)' : 'var(--bg2)', border: `1px solid ${toast.err ? 'rgba(232,74,95,0.5)' : 'var(--sage)'}`,
          color: toast.err ? '#fff' : 'var(--text)', padding: '10px 22px', borderRadius: 24, fontSize: 13, fontWeight: 500,
          boxShadow: 'var(--shadow-lg)', zIndex: 9999, pointerEvents: 'none' }}>
          {toast.err ? '⚠ ' : '✓ '}{toast.msg}
        </div>
      )}
    </div>
  )
}
