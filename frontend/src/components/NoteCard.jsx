function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NoteCard({ note, onClick, onPin, onArchive, onDelete }) {
  if (note.decryption_error) {
    return (
      <div className="note-card color-gray">
        <div className="note-content" style={{ color: 'var(--red)', fontSize: 12, letterSpacing: '0.3px' }}>
          ⚠ Decryption failed — wrong session key
        </div>
      </div>
    )
  }
  const stop = fn => e => { e.stopPropagation(); fn() }
  return (
    <div className={`note-card color-${note.color || 'default'}`} onClick={onClick}>
      {note.is_pinned && <div className="note-pin-indicator">📌</div>}
      {note.title   && <div className="note-title">{note.title}</div>}
      {note.content && <div className="note-content">{note.content}</div>}
      {note.labels?.length > 0 && (
        <div className="note-labels">
          {note.labels.map(l => <span key={l} className="note-label">{l}</span>)}
        </div>
      )}
      <div className="note-footer">
        <span className="note-date">{formatDate(note.updated_at)}</span>
        <div className="note-actions">
          <button className="btn-icon" title={note.is_pinned ? 'Unpin' : 'Pin'} onClick={stop(onPin)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill={note.is_pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </button>
          <button className="btn-icon" title={note.is_archived ? 'Unarchive' : 'Archive'} onClick={stop(onArchive)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </button>
          <button className="btn-icon danger" title="Delete" onClick={stop(onDelete)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
