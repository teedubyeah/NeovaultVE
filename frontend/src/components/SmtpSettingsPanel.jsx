import { useState, useEffect } from 'react'
import { smtpApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const MODE_INFO = {
  console: {
    label: '🖥 Console (disabled)',
    color: 'var(--text3)',
    desc: 'No emails are sent. Share invite links are printed to the backend server logs only. Useful for local testing.',
    warn: null,
  },
  anonymous: {
    label: '📤 App relay (anonymous)',
    color: 'var(--peach)',
    desc: "Emails are sent through the server's built-in relay using the SMTP credentials configured in the server's .env file. Recipients see a no-reply address from the app domain.",
    warn: '⚠ Anonymous relay emails are more likely to be blocked or marked as spam by recipient mail servers, because they are not sent from a domain with SPF/DKIM records tied to the sender. For reliable delivery, use your own SMTP credentials.',
  },
  custom: {
    label: '✉ Your own SMTP (recommended)',
    color: 'var(--sage)',
    desc: 'Emails are sent through your own SMTP server or provider (Gmail, SendGrid, Mailgun, Fastmail, etc.). This gives the best deliverability and lets you customise the From address.',
    warn: null,
  },
}

export default function SmtpSettingsPanel() {
  const { user } = useAuth()
  const [status,  setStatus]  = useState(null)
  const [form,    setForm]    = useState({ mode: 'console', host: '', port: 587, secure: false, user: '', pass: '', from_address: '' })
  const [testTo,  setTestTo]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg,     setMsg]     = useState(null) // { text, ok }
  const [passChanged, setPassChanged] = useState(false)

  useEffect(() => {
    smtpApi.get().then(s => {
      setStatus(s)
      setForm({
        mode:         s.mode         || 'console',
        host:         s.host         || '',
        port:         s.port         || 587,
        secure:       s.secure       || false,
        user:         s.user         || '',
        pass:         '',  // never pre-fill password
        from_address: s.from_address || '',
      })
      setTestTo(user?.email || '')
    }).catch(e => setMsg({ text: e.message, ok: false }))
  }, [])

  function flash(text, ok = true) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 5000) }

  async function handleSave() {
    setSaving(true)
    try {
      const body = { ...form }
      if (!passChanged) delete body.pass  // don't overwrite saved pass with blank
      await smtpApi.save(body)
      const updated = await smtpApi.get()
      setStatus(updated)
      setPassChanged(false)
      flash('Settings saved')
    } catch (e) { flash(e.message, false) }
    finally { setSaving(false) }
  }

  async function handleTest() {
    if (!testTo) return
    setTesting(true)
    try {
      const body = { ...form, to: testTo }
      if (!passChanged && status?.has_password) delete body.pass
      await smtpApi.test(body)
      flash('Test email sent to ' + testTo + ' ✓')
    } catch (e) { flash('Test failed: ' + e.message, false) }
    finally { setTesting(false) }
  }

  const modeInfo = MODE_INFO[form.mode] || MODE_INFO.console

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Email / SMTP Settings
        </div>
        <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, margin: 0 }}>
          Configure how share invite emails are delivered. Changes take effect immediately — no restart required.
        </p>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.ok ? 'rgba(153,184,152,0.1)' : 'rgba(232,74,95,0.1)',
          border: `1px solid ${msg.ok ? 'rgba(153,184,152,0.3)' : 'rgba(232,74,95,0.3)'}`,
          color: msg.ok ? 'var(--sage)' : 'var(--rose)' }}>
          {msg.text}
        </div>
      )}

      {/* Mode selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
          Delivery method
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(MODE_INFO).map(([key, info]) => (
            <label key={key} onClick={() => setForm(f => ({ ...f, mode: key }))} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
              padding: '12px 14px', borderRadius: 10, transition: 'all 0.15s',
              background: form.mode === key ? 'rgba(153,184,152,0.07)' : 'rgba(0,0,0,0.12)',
              border: `1px solid ${form.mode === key ? 'rgba(153,184,152,0.35)' : 'var(--border)'}`,
            }}>
              <input type="radio" name="smtp_mode" value={key} checked={form.mode === key}
                onChange={() => setForm(f => ({ ...f, mode: key }))}
                style={{ marginTop: 2, accentColor: 'var(--sage)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: form.mode === key ? info.color : 'var(--text2)', marginBottom: 3 }}>
                  {info.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                  {info.desc}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Spam warning for anonymous mode */}
      {form.mode === 'anonymous' && modeInfo.warn && (
        <div style={{ padding: '12px 14px', borderRadius: 8, marginBottom: 18, fontSize: 12, lineHeight: 1.6,
          background: 'rgba(254,206,171,0.08)', border: '1px solid rgba(254,206,171,0.3)',
          borderLeft: '4px solid var(--peach)', color: 'var(--text2)' }}>
          {modeInfo.warn}
        </div>
      )}

      {/* Anonymous mode: check relay available */}
      {form.mode === 'anonymous' && status && !status.anonymous_relay_available && (
        <div style={{ padding: '12px 14px', borderRadius: 8, marginBottom: 18, fontSize: 12, lineHeight: 1.6,
          background: 'rgba(232,74,95,0.07)', border: '1px solid rgba(232,74,95,0.25)',
          color: 'var(--rose)' }}>
          ⚠ No server-level relay is configured. Set <code>SMTP_HOST</code> in the server's <code>.env</code> file to enable the anonymous relay.
        </div>
      )}

      {/* Custom SMTP fields */}
      {form.mode === 'custom' && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px', marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 14 }}>
            SMTP Credentials
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Host</label>
              <input className="form-input" placeholder="smtp.gmail.com" value={form.host}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))} style={{ fontSize: 13 }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Port</label>
              <input className="form-input" type="number" value={form.port}
                onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 587 }))} style={{ fontSize: 13 }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>TLS</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.secure} onChange={e => setForm(f => ({ ...f, secure: e.target.checked }))}
                  style={{ accentColor: 'var(--sage)' }} />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Port 465</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Username</label>
              <input className="form-input" placeholder="you@example.com" value={form.user} autoComplete="off"
                onChange={e => setForm(f => ({ ...f, user: e.target.value }))} style={{ fontSize: 13 }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>
                Password {status?.has_password && !passChanged && <span style={{ color: 'var(--sage)', fontWeight: 400 }}>(saved)</span>}
              </label>
              <input className="form-input" type="password" autoComplete="new-password"
                placeholder={status?.has_password && !passChanged ? '••••••••' : 'SMTP password or app password'}
                value={form.pass}
                onChange={e => { setForm(f => ({ ...f, pass: e.target.value })); setPassChanged(true) }}
                style={{ fontSize: 13 }} />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>From address</label>
            <input className="form-input" placeholder='NeovisionVE <no-reply@yourdomain.com>' value={form.from_address}
              onChange={e => setForm(f => ({ ...f, from_address: e.target.value }))} style={{ fontSize: 13 }} />
          </div>

          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 7, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text2)' }}>Common providers:</strong>{' '}
            Gmail — host: smtp.gmail.com, port: 587, use an App Password (not your login password).{' '}
            SendGrid — host: smtp.sendgrid.net, port: 587, user: apikey, pass: your API key.{' '}
            Mailgun — host: smtp.mailgun.org, port: 587.
          </div>
        </div>
      )}

      {/* Save button */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {/* Test email */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
          Send test email
        </div>
        {form.mode === 'console' ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 14px', background: 'rgba(0,0,0,0.1)', borderRadius: 8 }}>
            Switch to Anonymous or Custom mode to send a real test email.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" type="email" placeholder="Send test to this address"
              value={testTo} onChange={e => setTestTo(e.target.value)}
              style={{ flex: 1, fontSize: 13 }} />
            <button className="btn btn-ghost" style={{ flexShrink: 0, width: 'auto', padding: '0 18px', fontSize: 13 }}
              onClick={handleTest} disabled={testing || !testTo}>
              {testing ? 'Sending…' : 'Send test →'}
            </button>
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
          Sends using the current form values (unsaved changes are included). Save first to persist.
        </p>
      </div>
    </div>
  )
}
