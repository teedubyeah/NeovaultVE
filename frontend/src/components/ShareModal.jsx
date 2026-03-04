import { useState, useEffect } from 'react'
import { shareApi } from '../utils/api'

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ShareModal({ itemType, itemId, itemTitle, onClose }) {
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [shares,  setShares]  = useState([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState(null)

  useEffect(() => {
    shareApi.sharedWithItem(itemId)
      .then(d => setShares(d.shares))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [itemId])

  async function handleShare() {
    setError(''); setSuccess('')
    if (!email.trim()) return setError('Email address is required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address')
    setSending(true)
    try {
      await shareApi.create({ item_type: itemType, item_id: itemId, recipient_email: email.trim(), message })
      setSuccess(`Invite sent to ${email.trim()}`)
      setEmail(''); setMessage('')
      const updated = await shareApi.sharedWithItem(itemId)
      setShares(updated.shares)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleRevoke(shareId) {
    setRevoking(shareId)
    try {
      await shareApi.revoke(shareId)
      setShares(prev => prev.filter(s => s.id !== shareId))
    } catch (err) {
      setError(err.message)
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: '100%', maxWidth: 500,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)',
        display: 'flex', flexDirection: 'column', maxHeight: '85vh',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--text)', marginBottom: 3 }}>
              Share {itemType === 'note' ? 'Note' : 'Bookmark'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
              {itemTitle || '(untitled)'}
            </p>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ marginTop: 2 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Send invite form */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--text3)', marginBottom: 12 }}>
              📧 Invite by email
            </div>

            {error   && <div className="error-msg"   style={{ marginBottom: 12 }}>⚠ {error}</div>}
            {success && <div className="success-msg" style={{ marginBottom: 12 }}>✓ {success}</div>}

            <div className="form-group" style={{ marginBottom: 10 }}>
              <input className="form-input" type="email" placeholder="recipient@example.com"
                value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && !sending && handleShare()} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <textarea className="form-input" placeholder="Optional message to recipient…"
                value={message} onChange={e => setMessage(e.target.value)}
                rows={2} style={{ resize: 'none', fontSize: 13 }} />
            </div>

            <div style={{ background: 'rgba(153,184,152,0.07)', border: '1px solid rgba(153,184,152,0.2)',
              borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              🔒 A secure invite link will be emailed. The recipient needs a NeovisionVE account to view
              the {itemType}. The content is encrypted in transit — even we can't read it.
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }}
              onClick={handleShare} disabled={sending || !email.trim()}>
              {sending ? 'Sending invite…' : 'Send invite →'}
            </button>
          </div>

          {/* Active shares list */}
          <div style={{ padding: '16px 22px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--text3)', marginBottom: 12 }}>
              Shared with
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>Loading…</div>
            ) : shares.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '16px 0',
                background: 'rgba(0,0,0,0.1)', borderRadius: 8 }}>
                Not shared with anyone yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shares.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, var(--coral), var(--rose))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {s.recipient_email[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.recipient_email}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Sent {formatDate(s.created_at)}</span>
                        <span style={{
                          padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          background: s.accepted ? 'rgba(153,184,152,0.15)' : 'rgba(254,206,171,0.15)',
                          color: s.accepted ? 'var(--sage)' : 'var(--peach)',
                          border: `1px solid ${s.accepted ? 'rgba(153,184,152,0.3)' : 'rgba(254,206,171,0.3)'}`,
                        }}>
                          {s.accepted ? '✓ Accepted' : '⏳ Pending'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revoking === s.id}
                      style={{ flexShrink: 0, background: 'none', border: '1px solid rgba(232,74,95,0.3)',
                        color: 'var(--rose)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                        fontSize: 11, fontFamily: 'var(--font)', transition: 'all 0.12s' }}
                      onMouseEnter={e => e.target.style.background = 'rgba(232,74,95,0.1)'}
                      onMouseLeave={e => e.target.style.background = 'none'}>
                      {revoking === s.id ? '…' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
