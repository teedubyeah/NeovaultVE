import { useState, useEffect, useRef } from 'react'

const COLORS = [
  { id: 'default', hex: '#243035' },
  { id: 'red', hex: '#5a2830' },
  { id: 'orange', hex: '#5a3828' },
  { id: 'yellow', hex: '#4a4228' },
  { id: 'green', hex: '#2a4030' },
  { id: 'teal', hex: '#1a3030' },
  { id: 'blue', hex: '#1a2040' },
  { id: 'purple', hex: '#2a1a40' },
  { id: 'pink', hex: '#502838' },
  { id: 'gray', hex: '#303e42' },
]

export default function NoteModal({ note, onClose, onSave, onDelete, onArchive }) {
  const [title, setTitle] = useState(note.title || '')
  const [content, setContent] = useState(note.content || '')
  const [color, setColor] = useState(note.color || 'default')
  const [labels, setLabels] = useState(note.labels || [])
  const [labelInput, setLabelInput] = useState('')
  const [isPinned, setIsPinned] = useState(note.is_pinned || false)
  const contentRef = useRef(null)

  useEffect(() => {
    contentRef.current?.focus()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = contentRef.current
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  }, [content])

  function handleClose() {
    const hasChanges =
      title !== (note.title || '') ||
      content !== (note.content || '') ||
      color !== (note.color || 'default') ||
      JSON.stringify(labels) !== JSON.stringify(note.labels || []) ||
      isPinned !== (note.is_pinned || false)

    if (hasChanges) {
      onSave({ title, content, color, labels, is_pinned: isPinned, is_archived: note.is_archived || false })
    } else {
      onClose()
    }
  }

  function addLabel() {
    const l = labelInput.trim()
    if (l && !labels.includes(l) && labels.length < 20) {
      setLabels(prev => [...prev, l])
      setLabelInput('')
    }
  }

  function handleLabelKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel() }
    if (e.key === 'Backspace' && !labelInput && labels.length > 0) {
      setLabels(prev => prev.slice(0, -1))
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) handleClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className={`modal color-${color}`}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 0', gap: 8 }}>
          <button className={`btn-icon ${isPinned ? 'active' : ''}`} onClick={() => setIsPinned(p => !p)} title="Toggle pin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="btn-icon" onClick={onArchive} title="Archive">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8"/>
                <rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </button>
            <button className="btn-icon danger" onClick={() => { if(confirm('Delete this note?')) onDelete() }} title="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>

        <textarea
          className="modal-title-input"
          placeholder="Title"
          rows={1}
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ resize: 'none', overflow: 'hidden' }}
        />
        <textarea
          ref={contentRef}
          className="modal-content-input"
          placeholder="Take a note…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />

        <div className="modal-footer">
          {/* Color picker */}
          <div className="color-picker">
            {COLORS.map(c => (
              <div
                key={c.id}
                className={`color-dot ${color === c.id ? 'selected' : ''}`}
                style={{ background: c.hex }}
                onClick={() => setColor(c.id)}
                title={c.id}
              />
            ))}
          </div>

          {/* Labels */}
          <div className="label-input-wrap" style={{ marginLeft: 12 }}>
            {labels.map(l => (
              <span key={l} className="label-chip">
                {l}
                <button onClick={() => setLabels(prev => prev.filter(x => x !== l))}>×</button>
              </span>
            ))}
            <input
              className="label-input"
              placeholder="Add label…"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              onBlur={addLabel}
            />
          </div>

          <div className="ml-auto">
            <button className="btn btn-ghost" style={{ padding: '7px 16px', fontSize: 13 }} onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
