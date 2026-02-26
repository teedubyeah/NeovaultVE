import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { notes as notesApi } from '../utils/api'
import NoteCard from '../components/NoteCard'
import NoteModal from '../components/NoteModal'
import QuickAdd from '../components/QuickAdd'
import MinkIcon from '../components/MinkIcon'

let dragPayload = null  // module-level, avoids stale closure in drag handlers

// ─── Label sidebar item ───────────────────────────────────────────────────────
function LabelItem({ label, count, selected, onSelect, onDrop }) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      onClick={() => onSelect(label)}
      onDragOver={e => { if (dragPayload?.type === 'note') { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (dragPayload?.type === 'note') onDrop(dragPayload.id, label) }}
      className="folder-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6,
        cursor: 'pointer', marginBottom: 2, userSelect: 'none',
        background: dragOver ? 'rgba(153,184,152,0.18)' : selected ? 'rgba(255,132,124,0.13)' : 'transparent',
        border: dragOver ? '1px dashed var(--sage)' : '1px solid transparent',
        color: selected ? 'var(--coral)' : 'var(--text2)', fontSize: 13, transition: 'all 0.12s',
      }}>
      <span style={{ fontSize: 11 }}>🏷</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 7px', borderRadius: 8 }}>{count}</span>
    </div>
  )
}

// ─── Draggable NoteCard wrapper ──────────────────────────────────────────────
function DraggableNoteCard({ note, onDragStart, onDragEnd, ...props }) {
  return (
    <div
      draggable
      onDragStart={e => { dragPayload = { type: 'note', id: note.id }; e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={() => { dragPayload = null; onDragEnd() }}
      style={{ cursor: 'grab' }}
    >
      <NoteCard note={note} {...props} />
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function NotesPage() {
  const { user, logout, isAdmin } = useAuth()
  const [allNotes,      setAllNotes]      = useState([])
  const [archivedNotes, setArchivedNotes] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState('notes')
  const [search,        setSearch]        = useState('')
  const [editNote,      setEditNote]      = useState(null)
  const [error,         setError]         = useState('')
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [dragging,      setDragging]      = useState(false)
  const [toast,         setToast]         = useState(null)
  // Drop zone for "remove label" (uncategorised area in sidebar)
  const [noDragOver,    setNoDragOver]    = useState(false)

  function showToast(msg, err = false) { setToast({ msg, err }); setTimeout(() => setToast(null), 3000) }

  const fetchNotes = useCallback(async () => {
    try {
      const [active, archived] = await Promise.all([notesApi.list(), notesApi.archived()])
      setAllNotes(active.notes)
      setArchivedNotes(archived.notes)
    } catch (err) { setError('Failed to load notes.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  // Collect all labels from all notes
  const allLabels = [...new Set(allNotes.flatMap(n => n.labels || []))].sort()
  const labelCounts = {}
  allNotes.forEach(n => (n.labels || []).forEach(l => { labelCounts[l] = (labelCounts[l] || 0) + 1 }))

  const sourceNotes = tab === 'notes' ? allNotes : archivedNotes

  const displayNotes = sourceNotes.filter(n => {
    if (n.decryption_error) return true
    const q = search.toLowerCase()
    const matchesSearch = !q || n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q) || n.labels?.some(l => l.toLowerCase().includes(q))
    const matchesLabel  = !selectedLabel || (n.labels || []).includes(selectedLabel)
    return matchesSearch && matchesLabel
  })

  const pinned = displayNotes.filter(n => n.is_pinned && !n.decryption_error)
  const others  = displayNotes.filter(n => !n.is_pinned || n.decryption_error)

  // Note CRUD
  async function handleCreate(note) {
    try {
      const data = await notesApi.create(note)
      setAllNotes(prev => [data.note, ...prev])
    } catch { setError('Failed to save note') }
  }

  async function handleUpdate(id, updates) {
    try {
      await notesApi.update(id, updates)
      setAllNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
      setArchivedNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
      if ('is_archived' in updates) await fetchNotes()
    } catch { setError('Failed to update note') }
  }

  async function handleDelete(id) {
    try {
      await notesApi.delete(id)
      setAllNotes(prev => prev.filter(n => n.id !== id))
      setArchivedNotes(prev => prev.filter(n => n.id !== id))
      setEditNote(null)
    } catch { setError('Failed to delete note') }
  }

  // Drag: add a label to a note
  async function handleDropOnLabel(noteId, label) {
    const note = allNotes.find(n => n.id === noteId)
    if (!note || (note.labels || []).includes(label)) return
    const updatedLabels = [...(note.labels || []), label]
    await handleUpdate(noteId, { ...note, labels: updatedLabels })
    showToast(`Label "${label}" added`)
  }

  // Drag: remove all labels from a note (drop on "No label" zone)
  async function handleDropUnlabel(noteId) {
    const note = allNotes.find(n => n.id === noteId)
    if (!note || !(note.labels || []).length) return
    await handleUpdate(noteId, { ...note, labels: [] })
    showToast('Labels removed')
  }

  return (
    <div className="app-layout">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><MinkIcon size={18} /></div>
          <span className="topbar-logo-text">Neovision<span>VE</span></span>
        </div>

        {/* Module switcher */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          <div style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--bg2)', color: 'var(--coral)', border: '1px solid var(--border2)' }}>
            📝 Notes
          </div>
          <Link to="/bookmarks" style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none', color: 'var(--text3)' }}>
            🔖 Bookmarks
          </Link>
        </div>

        <div className="search-bar">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search encrypted notes…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="topbar-actions">
          {isAdmin && <Link to="/admin" className="btn btn-ghost btn-sm" style={{ fontSize: 12, letterSpacing: '0.5px' }}>⚙ Admin</Link>}
          <Link to="/change-password" className="btn btn-ghost btn-sm" style={{ fontSize: 12, letterSpacing: '0.5px' }}>🔑 Password</Link>
          <Link to="/clear-data" className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--rose)', opacity: 0.7 }} title="Clear all my data">🗑 Clear Data</Link>
          <div className="user-chip">
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <span>{user?.username}</span>
            {isAdmin && <span className="admin-badge">Admin</span>}
          </div>
          <button className="btn-icon" title="Sign out" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Label Sidebar ─────────────────────────────────────────────── */}
        <aside style={{ width: 210, flexShrink: 0, background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)' }}>Labels</span>
          </div>

          <div style={{ padding: '8px 8px 4px' }}>
            {/* All notes */}
            <div onClick={() => setSelectedLabel(null)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                background: selectedLabel === null ? 'rgba(255,132,124,0.13)' : 'transparent',
                color: selectedLabel === null ? 'var(--coral)' : 'var(--text2)',
                fontSize: 13, transition: 'all 0.12s', border: '1px solid transparent' }}>
              <span>📝 All Notes</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 7px', borderRadius: 8 }}>
                {allNotes.filter(n => !n.decryption_error).length}
              </span>
            </div>

            {/* No label / drop to remove labels */}
            <div onClick={() => { setSelectedLabel('__none__') }}
              onDragOver={e => { if (dragPayload?.type === 'note') { e.preventDefault(); setNoDragOver(true) } }}
              onDragLeave={() => setNoDragOver(false)}
              onDrop={e => { e.preventDefault(); setNoDragOver(false); if (dragPayload?.type === 'note') handleDropUnlabel(dragPayload.id) }}
              className="folder-row"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                background: noDragOver ? 'rgba(153,184,152,0.18)' : selectedLabel === '__none__' ? 'rgba(255,132,124,0.13)' : 'transparent',
                border: noDragOver ? '1px dashed var(--sage)' : '1px solid transparent',
                color: selectedLabel === '__none__' ? 'var(--coral)' : 'var(--text2)',
                fontSize: 13, transition: 'all 0.12s' }}>
              <span>🚫 No Label</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', padding: '1px 7px', borderRadius: 8 }}>
                {allNotes.filter(n => !(n.labels || []).length && !n.decryption_error).length}
              </span>
            </div>
          </div>

          {allLabels.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px 6px' }} />}

          <div style={{ flex: 1, padding: '0 8px 16px' }}>
            {allLabels.map(label => (
              <LabelItem key={label} label={label} count={labelCounts[label] || 0}
                selected={selectedLabel === label}
                onSelect={l => setSelectedLabel(prev => prev === l ? null : l)}
                onDrop={handleDropOnLabel} />
            ))}
            {allLabels.length === 0 && !loading && (
              <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '20px 10px', lineHeight: 1.6 }}>
                No labels yet.<br/>Add labels to notes to<br/>organize them here.
              </div>
            )}
          </div>

          {dragging && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'rgba(153,184,152,0.06)',
              fontSize: 11, color: 'var(--sage)', textAlign: 'center', lineHeight: 1.5 }}>
              Drop onto a label to add it,<br/>or "No Label" to remove all
            </div>
          )}
        </aside>

        {/* ── Main notes area ────────────────────────────────────────────── */}
        <main className="main-content" style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div className="error-msg" style={{ maxWidth: 600, margin: '0 auto 24px', cursor: 'pointer' }} onClick={() => setError('')}>
              ⚠ {error} (click to dismiss)
            </div>
          )}

          {tab === 'notes' && <QuickAdd onCreate={handleCreate} />}

          {selectedLabel && selectedLabel !== '__none__' && (
            <div style={{ maxWidth: 900, margin: '0 auto 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Filtering by label:</span>
              <span style={{ fontSize: 12, color: 'var(--coral)', background: 'rgba(255,132,124,0.1)',
                padding: '3px 12px', borderRadius: 12, border: '1px solid rgba(255,132,124,0.3)',
                display: 'flex', alignItems: 'center', gap: 6 }}>
                🏷 {selectedLabel}
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--coral)', padding: 0, lineHeight: 1, fontSize: 14 }}
                  onClick={() => setSelectedLabel(null)}>✕</button>
              </span>
            </div>
          )}

          <div className="tab-bar">
            <button className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
              Notes {allNotes.length > 0 && `(${allNotes.length})`}
            </button>
            <button className={`tab ${tab === 'archived' ? 'active' : ''}`} onClick={() => setTab('archived')}>
              Archive {archivedNotes.length > 0 && `(${archivedNotes.length})`}
            </button>
          </div>

          {loading ? (
            <div className="empty-state">
              <p style={{ fontFamily: 'var(--font)', fontSize: 13, letterSpacing: 2, color: 'var(--text3)', textTransform: 'uppercase' }}>
                Decrypting vault…
              </p>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <div>
                  <div className="section-header">📌 Pinned</div>
                  <div className="notes-grid">
                    {pinned.map(note => (
                      <DraggableNoteCard key={note.id} note={note}
                        onDragStart={() => setDragging(true)}
                        onDragEnd={() => setDragging(false)}
                        onClick={() => setEditNote(note)}
                        onPin={() => handleUpdate(note.id, { ...note, is_pinned: !note.is_pinned })}
                        onArchive={() => handleUpdate(note.id, { ...note, is_archived: !note.is_archived })}
                        onDelete={() => handleDelete(note.id)} />
                    ))}
                  </div>
                </div>
              )}
              {others.length > 0 && (
                <div style={{ marginTop: pinned.length > 0 ? 32 : 0 }}>
                  {pinned.length > 0 && <div className="section-header">Other notes</div>}
                  <div className="notes-grid">
                    {others.map(note => (
                      <DraggableNoteCard key={note.id} note={note}
                        onDragStart={() => setDragging(true)}
                        onDragEnd={() => setDragging(false)}
                        onClick={() => setEditNote(note)}
                        onPin={() => handleUpdate(note.id, { ...note, is_pinned: !note.is_pinned })}
                        onArchive={() => handleUpdate(note.id, { ...note, is_archived: !note.is_archived })}
                        onDelete={() => handleDelete(note.id)} />
                    ))}
                  </div>
                </div>
              )}
              {displayNotes.length === 0 && (
                <div className="empty-state">
                  <MinkIcon size={52} style={{ opacity: 0.2, marginBottom: 16 }} />
                  <h3>{search ? 'No notes found' : selectedLabel ? `No notes with label "${selectedLabel}"` : tab === 'archived' ? 'No archived notes' : 'No notes yet'}</h3>
                  <p>{search ? 'Try a different search' : tab === 'notes' ? 'Add your first encrypted note above' : 'Archive notes to find them here'}</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.err ? 'var(--rose)' : 'var(--bg2)', border: `1px solid ${toast.err ? 'rgba(232,74,95,0.5)' : 'var(--sage)'}`,
          color: toast.err ? '#fff' : 'var(--text)', padding: '10px 22px', borderRadius: 24, fontSize: 13, fontWeight: 500,
          boxShadow: 'var(--shadow-lg)', animation: 'fadeIn 0.2s ease', zIndex: 9999, pointerEvents: 'none' }}>
          {toast.err ? '⚠ ' : '✓ '}{toast.msg}
        </div>
      )}

      {editNote && (
        <NoteModal note={editNote}
          onClose={() => setEditNote(null)}
          onSave={updates => { handleUpdate(editNote.id, updates); setEditNote(null) }}
          onDelete={() => handleDelete(editNote.id)}
          onArchive={() => { handleUpdate(editNote.id, { ...editNote, is_archived: !editNote.is_archived }); setEditNote(null) }} />
      )}
    </div>
  )
}
