import { useState } from 'react'
import { bookmarksApi } from '../utils/api'

function getFavicon(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` } catch { return null }
}
function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

// ─── Single conflict card ────────────────────────────────────────────────────
function ConflictCard({ conflict, resolution, onResolve }) {
  const { incoming, existing, differences } = conflict
  const favicon = getFavicon(incoming.url)

  const options = [
    { value: 'keep_existing', label: 'Keep existing',  desc: 'Discard the imported version' },
    { value: 'keep_incoming', label: 'Use imported',   desc: 'Overwrite existing with imported' },
    { value: 'keep_both',     label: 'Keep both',      desc: 'Insert imported as a new entry' },
  ]

  return (
    <div style={{
      background: 'var(--bg3)', border: `1px solid ${resolution ? 'rgba(153,184,152,0.4)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s',
    }}>
      {/* URL header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8 }}>
        {favicon && <img src={favicon} alt="" width={13} height={13} style={{ borderRadius: 2, flexShrink: 0 }} onError={e => e.target.style.display='none'} />}
        <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getDomain(incoming.url)}
        </span>
        {resolution && (
          <span style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 600, letterSpacing: '0.5px', flexShrink: 0 }}>✓ resolved</span>
        )}
      </div>

      {/* Side-by-side comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
        {/* Existing */}
        <div style={{ padding: '12px 14px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
            color: 'var(--text3)', marginBottom: 6 }}>Existing</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: differences.title ? 'var(--peach)' : 'var(--text)',
            lineHeight: 1.4, marginBottom: 4 }}>
            {existing.title || <span style={{ opacity: 0.4 }}>No title</span>}
          </div>
          {differences.folder && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              📁 {existing.folderPath || <em>No folder</em>}
            </div>
          )}
        </div>
        {/* Incoming */}
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
            color: 'var(--text3)', marginBottom: 6 }}>Importing</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: differences.title ? 'var(--peach)' : 'var(--text)',
            lineHeight: 1.4, marginBottom: 4 }}>
            {incoming.title || <span style={{ opacity: 0.4 }}>No title</span>}
          </div>
          {differences.folder && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              📁 {incoming.folderPath || <em>No folder</em>}
            </div>
          )}
        </div>
      </div>

      {/* Resolution buttons */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
        {options.map(opt => (
          <button key={opt.value} onClick={() => onResolve(opt.value)}
            style={{
              flex: 1, padding: '7px 6px', borderRadius: 7, cursor: 'pointer', transition: 'all 0.12s',
              border: `1px solid ${resolution === opt.value ? 'var(--sage)' : 'var(--border)'}`,
              background: resolution === opt.value ? 'rgba(153,184,152,0.15)' : 'var(--bg2)',
              color: resolution === opt.value ? 'var(--sage)' : 'var(--text3)',
              fontFamily: 'var(--font)', fontSize: 11, fontWeight: resolution === opt.value ? 700 : 400,
              textAlign: 'center', lineHeight: 1.4,
            }}
            title={opt.desc}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main ImportModal ────────────────────────────────────────────────────────
export default function ImportModal({ html, preview, onClose, onComplete }) {
  // resolutions: { [normalisedUrl]: 'keep_existing' | 'keep_incoming' | 'keep_both' }
  const [resolutions, setResolutions] = useState({})
  const [confirming,  setConfirming]  = useState(false)
  const [error,       setError]       = useState('')
  const [tab,         setTab]         = useState('conflicts') // 'conflicts' | 'new' | 'duplicates'

  const { summary, conflicts, new_items, exact_duplicates } = preview

  // URL key used server-side for resolution map
  function normUrl(url) {
    try { const u = new URL(url); return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '') + (u.search || '') }
    catch { return (url || '').toLowerCase().trim() }
  }

  function resolveAll(value) {
    const all = {}
    conflicts.forEach(c => { all[normUrl(c.incoming.url)] = value })
    setResolutions(all)
  }

  const resolvedCount  = Object.keys(resolutions).length
  const totalConflicts = conflicts.length
  const allResolved    = resolvedCount >= totalConflicts

  async function handleConfirm() {
    setConfirming(true); setError('')
    try {
      const result = await bookmarksApi.importConfirm(html, resolutions)
      onComplete(result)
    } catch (err) {
      setError(err.message)
      setConfirming(false)
    }
  }

  const tabs = [
    { id: 'conflicts',  label: `⚠ Conflicts`,       count: totalConflicts,         show: totalConflicts > 0 },
    { id: 'new',        label: `＋ New`,              count: summary.new_bookmarks,  show: true },
    { id: 'duplicates', label: `= Exact Duplicates`, count: summary.exact_duplicates, show: true },
  ].filter(t => t.show)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: '100%', maxWidth: 680, maxHeight: '88vh',
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--text)', marginBottom: 6 }}>
              Import Preview
            </h3>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text3)' }}>
              <span style={{ color: 'var(--sage)' }}>＋ {summary.new_bookmarks} new</span>
              {summary.conflicts > 0 && <span style={{ color: 'var(--peach)' }}>⚠ {summary.conflicts} conflicts</span>}
              <span>= {summary.exact_duplicates} exact duplicates</span>
              {summary.new_folders > 0 && <span>📁 {summary.new_folders} new folders</span>}
              {summary.merged_folders > 0 && <span>📂 {summary.merged_folders} folders merged</span>}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ marginTop: 2 }}>✕</button>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 22px' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? 'var(--coral)' : 'var(--text3)',
                borderBottom: `2px solid ${tab === t.id ? 'var(--coral)' : 'transparent'}`,
                marginBottom: -1, transition: 'all 0.12s',
              }}>
                {t.label} <span style={{ marginLeft: 4, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 8, fontSize: 10 }}>{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>

          {tab === 'conflicts' && (
            <>
              {totalConflicts === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>
                  No conflicts found
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
                      These bookmarks already exist with different details. Choose how to handle each one.
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 16 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => resolveAll('keep_existing')}>All → Keep existing</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => resolveAll('keep_both')}>All → Keep both</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {conflicts.map((c, i) => (
                      <ConflictCard key={i} conflict={c}
                        resolution={resolutions[normUrl(c.incoming.url)]}
                        onResolve={val => setResolutions(prev => ({ ...prev, [normUrl(c.incoming.url)]: val }))} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'new' && (
            <>
              {new_items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>
                  No new bookmarks to import
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
                    These {new_items.length} bookmarks don't exist in your vault and will be imported.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {new_items.map((b, i) => {
                      const favicon = getFavicon(b.url)
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                          {favicon && <img src={favicon} alt="" width={13} height={13} style={{ borderRadius: 2, flexShrink: 0 }} onError={e => e.target.style.display='none'} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.title || getDomain(b.url)}
                            </div>
                            {b.folderPath && (
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>📁 {b.folderPath}</div>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{getDomain(b.url)}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'duplicates' && (
            <>
              {exact_duplicates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>
                  No exact duplicates
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
                    These {exact_duplicates.length} bookmarks are identical to existing entries and will be silently skipped.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {exact_duplicates.map((d, i) => {
                      const favicon = getFavicon(d.incoming.url)
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)', opacity: 0.6 }}>
                          {favicon && <img src={favicon} alt="" width={13} height={13} style={{ borderRadius: 2, flexShrink: 0 }} onError={e => e.target.style.display='none'} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.incoming.title || getDomain(d.incoming.url)}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--sage)' }}>= already exists</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)',
          flexShrink: 0 }}>
          {error && <div className="error-msg" style={{ marginBottom: 10 }}>⚠ {error}</div>}

          {totalConflicts > 0 && !allResolved && (
            <div style={{ fontSize: 12, color: 'var(--peach)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠ {totalConflicts - resolvedCount} conflict{totalConflicts - resolvedCount !== 1 ? 's' : ''} still need a decision
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto', minWidth: 160 }}
              onClick={handleConfirm}
              disabled={confirming || (totalConflicts > 0 && !allResolved)}>
              {confirming ? 'Importing…'
                : totalConflicts > 0 && !allResolved ? `Resolve ${totalConflicts - resolvedCount} more…`
                : `Import ${summary.new_bookmarks + (Object.values(resolutions).filter(r => r !== 'keep_existing').length)} bookmarks`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
