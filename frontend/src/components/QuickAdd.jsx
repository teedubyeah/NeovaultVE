import { useState, useRef } from 'react'

const COLORS = [
  { id: 'default', hex: '#243035' },
  { id: 'red',     hex: '#5a2830' },
  { id: 'orange',  hex: '#5a3828' },
  { id: 'yellow',  hex: '#4a4228' },
  { id: 'green',   hex: '#2a4030' },
  { id: 'teal',    hex: '#1a3030' },
  { id: 'blue',    hex: '#1a2040' },
  { id: 'purple',  hex: '#2a1840' },
  { id: 'pink',    hex: '#502838' },
  { id: 'gray',    hex: '#303e42' },
]

export default function QuickAdd({ onCreate }) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [color, setColor] = useState('default')
  const [saving, setSaving] = useState(false)
  const contentRef = useRef(null)

  function expand() { setExpanded(true); setTimeout(() => contentRef.current?.focus(), 50) }

  async function save() {
    if (!title.trim() && !content.trim()) { setExpanded(false); return }
    setSaving(true)
    try {
      await onCreate({ title, content, color, labels: [], is_pinned: false, is_archived: false })
      setTitle(''); setContent(''); setColor('default'); setExpanded(false)
    } finally { setSaving(false) }
  }

  if (!expanded) {
    return (
      <div className="quick-add">
        <div className="quick-add-box" onClick={expand} style={{ cursor: 'text' }}>
          <div style={{ padding: '16px 18px', color: 'var(--text3)', fontFamily: 'var(--font)', fontSize: 15, letterSpacing: '0.3px' }}>
            🔒 Take an encrypted note…
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quick-add">
      <div className="quick-add-box">
        <input className="quick-add-title" placeholder="Title" value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setExpanded(false)} autoFocus />
        <textarea ref={contentRef} className="quick-add-body" placeholder="Take a note…"
          value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setExpanded(false)} rows={3} />
        <div className="quick-add-footer">
          <div className="color-picker">
            {COLORS.map(c => (
              <div key={c.id} className={`color-dot ${color === c.id ? 'selected' : ''}`}
                style={{ background: c.hex }} onClick={() => setColor(c.id)} />
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => { setExpanded(false); setTitle(''); setContent(''); setColor('default') }}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 18px', fontSize: 13 }}
              onClick={save} disabled={saving}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
