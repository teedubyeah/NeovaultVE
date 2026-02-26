import { useState } from 'react'
import MinkIcon from './MinkIcon'

/**
 * Shown once after registration before the user enters the app.
 * They must tick each checkbox and type UNDERSTOOD before continuing.
 * This ensures they genuinely read the encryption model, not just click through.
 */
export default function EncryptionWarning({ username, onAcknowledged }) {
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false, c4: false })
  const [confirm, setConfirm] = useState('')

  const allChecked = Object.values(checks).every(Boolean)
  const canProceed = allChecked && confirm.trim().toUpperCase() === 'UNDERSTOOD'

  function toggle(key) {
    setChecks(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', zIndex: 9999,
      animation: 'fadeIn 0.3s ease',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 60%, rgba(232,74,95,0.08) 0%, transparent 65%)',
      }} />

      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative', zIndex: 1,
        animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Header bar */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(232,74,95,0.15), rgba(255,132,124,0.08))',
          borderBottom: '1px solid rgba(232,74,95,0.25)',
          padding: '24px 28px',
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--coral), var(--rose))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 4px 16px rgba(232,74,95,0.4)',
          }}>
            <MinkIcon size={26} />
          </div>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              color: 'var(--coral)', marginBottom: 6, fontFamily: 'var(--font)',
            }}>
              ⚠ Important — Please read carefully
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
              How NeovisionVE protects your notes
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px' }}>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 20 }}>
            Welcome, <strong style={{ color: 'var(--text)' }}>{username}</strong>. Before you start,
            you need to understand how encryption works here — because it directly
            affects what happens if you ever forget your password.
          </p>

          {/* Core explanation box */}
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--border2)',
            borderRadius: 10, padding: '16px 18px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
              How it works
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
              Your password is used to <strong style={{ color: 'var(--peach)' }}>mathematically generate</strong> the
              key that encrypts every note you write. That key is <strong style={{ color: 'var(--peach)' }}>never stored</strong> anywhere
              — not on the server, not in the database, not in memory after your session ends.
              <br /><br />
              This means <strong style={{ color: 'var(--coral)' }}>NeovisionVE cannot read your notes</strong>, and
              neither can anyone else — including administrators.
            </div>
          </div>

          {/* Warning box */}
          <div style={{
            background: 'rgba(232,74,95,0.08)',
            border: '1px solid rgba(232,74,95,0.35)',
            borderLeft: '4px solid var(--rose)',
            borderRadius: 10, padding: '16px 18px', marginBottom: 24,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--rose)', marginBottom: 10 }}>
              ⚠ If you forget your password
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
              There is <strong style={{ color: 'var(--rose)' }}>no password reset</strong> and{' '}
              <strong style={{ color: 'var(--rose)' }}>no account recovery</strong>. Because the encryption
              key comes from your password, losing your password means losing access to all your notes —
              permanently. No administrator can recover them.
              <br /><br />
              You <em>can</em> change your password later from your account settings, which will
              safely re-encrypt all your notes — but only while you are logged in and know your current password.
            </div>
          </div>

          {/* Checkboxes */}
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'c1', text: 'My password generates my encryption key. It is never stored anywhere.' },
              { key: 'c2', text: 'If I forget my password, my notes cannot be recovered by anyone.' },
              { key: 'c3', text: 'I can change my password safely in account settings while I am logged in.' },
              { key: 'c4', text: 'I will store my password somewhere safe, such as a password manager.' },
            ].map(({ key, text }) => (
              <label key={key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                padding: '10px 14px',
                background: checks[key] ? 'rgba(153,184,152,0.07)' : 'rgba(0,0,0,0.1)',
                border: `1px solid ${checks[key] ? 'rgba(153,184,152,0.3)' : 'var(--border)'}`,
                borderRadius: 8, transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={() => toggle(key)}
                  style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0, accentColor: 'var(--sage)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: checks[key] ? 'var(--text)' : 'var(--text2)', lineHeight: 1.5, transition: 'color 0.15s' }}>
                  {text}
                </span>
              </label>
            ))}
          </div>

          {/* Confirmation word */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 1.5,
              textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8,
            }}>
              Type <strong style={{ color: 'var(--coral)', letterSpacing: 2 }}>UNDERSTOOD</strong> to continue
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="UNDERSTOOD"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={{ letterSpacing: 2, fontWeight: 600 }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <button
            className="btn btn-primary"
            disabled={!canProceed}
            onClick={onAcknowledged}
            style={{ opacity: canProceed ? 1 : 0.4, transition: 'opacity 0.2s' }}
          >
            {canProceed ? 'I understand — take me to my vault' : 'Complete all items above to continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
