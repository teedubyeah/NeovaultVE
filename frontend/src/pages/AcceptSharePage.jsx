import { useState, useEffect } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { shareApi } from '../utils/api'
import MinkIcon from '../components/MinkIcon'

export default function AcceptSharePage() {
  const [searchParams]  = useSearchParams()
  const token           = searchParams.get('token')
  const { user, login } = useAuth()
  const navigate        = useNavigate()

  const [preview,   setPreview]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [accepting, setAccepting] = useState(false)
  const [done,      setDone]      = useState(null)

  useEffect(() => {
    if (!token) { setError('No share token found in URL.'); setLoading(false); return }
    shareApi.preview(token)
      .then(d => setPreview(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept() {
    setAccepting(true); setError('')
    try {
      const result = await shareApi.accept(token)
      setDone(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  function renderContent() {
    if (!preview) return null
    const { item_type, content } = preview
    const item = content?.item

    if (item_type === 'note') {
      return (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          {item.title && (
            <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              {item.title}
            </div>
          )}
          {item.content && (
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
              maxHeight: 300, overflowY: 'auto' }}>
              {item.content}
            </div>
          )}
          {item.labels?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {item.labels.map(l => (
                <span key={l} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8,
                  background: 'rgba(153,184,152,0.12)', border: '1px solid rgba(153,184,152,0.25)', color: 'var(--sage)' }}>
                  🏷 {l}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (item_type === 'bookmark') {
      let favicon = null
      try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32` } catch {}
      return (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            {favicon && <img src={favicon} alt="" width={16} height={16} style={{ borderRadius: 3, marginTop: 2, flexShrink: 0 }} onError={e => e.target.style.display='none'} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                {item.title || item.url}
              </div>
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--coral)', textDecoration: 'none' }}>
                {item.url}
              </a>
            </div>
          </div>
          {item.description && (
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 8 }}>
              {item.description}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#FF847C,#E84A5F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MinkIcon size={20} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            Neovision<span style={{ color: 'var(--coral)' }}>VE</span>
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: 40 }}>
            Loading share…
          </div>
        ) : error ? (
          <div style={{ background: 'var(--bg2)', border: '1px solid rgba(232,74,95,0.3)', borderRadius: 14, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>Share unavailable</div>
            <div style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 20 }}>{error}</div>
            <Link to="/" className="btn btn-ghost btn-sm" style={{ display: 'inline-block', width: 'auto' }}>Go to app</Link>
          </div>
        ) : done ? (
          <div style={{ background: 'var(--bg2)', border: '1px solid rgba(153,184,152,0.3)', borderRadius: 14, padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>
              {done.item_type === 'note' ? 'Note' : 'Bookmark'} saved to your vault
            </div>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, lineHeight: 1.6 }}>
              The shared {done.item_type} has been encrypted with your key and added to your vault.
            </p>
            <Link to={done.item_type === 'note' ? '/' : '/bookmarks'}
              className="btn btn-primary" style={{ display: 'inline-block', width: 'auto' }}>
              Open my vault →
            </Link>
          </div>
        ) : preview ? (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Share meta */}
            <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,132,124,0.05)' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                Shared {preview.item_type}
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--text)', fontWeight: 700, marginBottom: 6 }}>
                {preview.owner_username} shared something with you
              </div>
              {preview.message && (
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, padding: '8px 12px',
                  background: 'rgba(0,0,0,0.1)', borderRadius: 7, marginTop: 8, fontStyle: 'italic' }}>
                  "{preview.message}"
                </div>
              )}
            </div>

            {/* Content preview */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              {renderContent()}
            </div>

            {/* Accept area */}
            <div style={{ padding: '16px 22px' }}>
              {preview.already_accepted ? (
                <div style={{ textAlign: 'center', color: 'var(--sage)', fontSize: 13 }}>
                  ✓ You already accepted this share
                </div>
              ) : !user ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
                    To save this {preview.item_type} to your vault, you need a NeovisionVE account.
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Link to={`/register?redirect=${encodeURIComponent(window.location.href)}`}
                      className="btn btn-primary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
                      Create account
                    </Link>
                    <Link to={`/login?redirect=${encodeURIComponent(window.location.href)}`}
                      className="btn btn-ghost" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
                      Log in
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  {error && <div className="error-msg" style={{ marginBottom: 12 }}>⚠ {error}</div>}
                  <button className="btn btn-primary" style={{ width: '100%' }}
                    onClick={handleAccept} disabled={accepting}>
                    {accepting ? 'Saving to vault…' : `Accept & save to my vault`}
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
                    Logged in as {user.username} · The {preview.item_type} will be encrypted with your key
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
