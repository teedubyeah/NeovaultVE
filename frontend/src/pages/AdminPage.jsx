import { useState, useEffect } from 'react'
import { Link } from "react-router-dom"
import MinkIcon from "../components/MinkIcon"
import { useAuth } from '../context/AuthContext'
import { admin as adminApi } from '../utils/api'

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} style={danger ? { width: 'auto' } : { width: 'auto' }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const { user, logout } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Add user form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ username: '', email: '', password: '', role: 'user' })
  const [addLoading, setAddLoading] = useState(false)

  // Reset password
  const [resetId, setResetId] = useState(null)
  const [resetPw, setResetPw] = useState('')

  // Confirm dialog
  const [confirm, setConfirm] = useState(null)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    try {
      const data = await adminApi.users()
      setUsers(data.users)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function flash(msg, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setAddLoading(true)
    try {
      const data = await adminApi.createUser(addForm)
      setUsers(prev => [...prev, data.user])
      setAddForm({ username: '', email: '', password: '', role: 'user' })
      setShowAddForm(false)
      flash('User created successfully')
    } catch (err) {
      flash(err.message, true)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleToggleActive(u) {
    try {
      await adminApi.updateUser(u.id, { is_active: !u.is_active })
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
      flash(`${u.username} ${!u.is_active ? 'activated' : 'deactivated'}`)
    } catch (err) {
      flash(err.message, true)
    }
  }

  async function handleToggleRole(u) {
    const newRole = u.role === 'admin' ? 'user' : 'admin'
    try {
      await adminApi.updateUser(u.id, { role: newRole })
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x))
      flash(`${u.username} is now ${newRole}`)
    } catch (err) {
      flash(err.message, true)
    }
  }

  async function handleDelete(u) {
    setConfirm({
      title: 'Delete user',
      message: `Permanently delete "${u.username}" and all their encrypted notes? This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        try {
          await adminApi.deleteUser(u.id)
          setUsers(prev => prev.filter(x => x.id !== u.id))
          flash(`${u.username} deleted`)
        } catch (err) {
          flash(err.message, true)
        }
      }
    })
  }

  async function handleClearData(u) {
    setConfirm({
      title: 'Clear user data',
      message: `Delete ALL notes, bookmarks, and folders for "${u.username}"? Their account will remain. This cannot be undone.`,
      confirmLabel: 'Clear data',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        try {
          const r = await adminExt.clearUserData(u.id)
          flash(`Cleared ${r.deleted.notes} notes, ${r.deleted.bookmarks} bookmarks for ${u.username}`)
          fetchUsers()
        } catch (err) {
          flash(err.message, true)
        }
      }
    })
  }

  async function handleClearAllData() {
    setConfirm({
      title: '⚠ Clear ALL user data',
      message: 'This will permanently delete every note, bookmark, and folder for EVERY user on this server. User accounts will remain. This absolutely cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        try {
          const r = await adminExt.clearAllData()
          flash(`Cleared ${r.deleted.notes} notes and ${r.deleted.bookmarks} bookmarks across all users`)
          fetchUsers()
        } catch (err) {
          flash(err.message, true)
        }
      }
    })
  }

  async function handleResetPassword(userId) {
    if (!resetPw || resetPw.length < 12) {
      flash('Password must be at least 12 characters', true); return
    }
    try {
      const data = await adminApi.resetPassword(userId, { password: resetPw })
      setResetId(null); setResetPw('')
      flash(data.warning || 'Password reset successfully')
    } catch (err) {
      flash(err.message, true)
    }
  }

  const totalNotes = users.reduce((s, u) => s + (u.note_count || 0), 0)
  const activeUsers = users.filter(u => u.is_active).length
  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><MinkIcon size={18} /></div>
          <span className="topbar-logo-text">Neovision<span>VE</span></span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/" className="btn btn-ghost btn-sm">← Notes</Link>
          <div className="user-chip">
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <span>{user?.username}</span>
            <span className="admin-badge">Admin</span>
          </div>
          <button className="btn-icon" title="Sign out" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      <div className="admin-page">
        <div className="admin-header">
          <div>
            <h1>User Management</h1>
            <p>Manage accounts, roles, and access</p>
          </div>
        </div>

        {error   && <div className="error-msg">⚠ {error}</div>}
        {success && <div className="success-msg">✓ {success}</div>}

        {/* Stats */}
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-val">{users.length}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{activeUsers}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{adminCount}</div>
            <div className="stat-label">Admins</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{totalNotes}</div>
            <div className="stat-label">Total Notes</div>
          </div>
        </div>

        {/* User table */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h2>Accounts</h2>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }}
              onClick={() => setShowAddForm(v => !v)}>
              {showAddForm ? '✕ Cancel' : '+ Add User'}
            </button>
          </div>

          {/* Add user form */}
          {showAddForm && (
            <form onSubmit={handleAddUser}>
              <div className="add-user-form">
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input className="form-input" placeholder="username" required
                    value={addForm.username}
                    onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" placeholder="user@example.com" required
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password (min 12 chars)</label>
                  <input className="form-input" type="password" placeholder="••••••••••••" required
                    value={addForm.password}
                    onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={addForm.role}
                    onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="full-width" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }} disabled={addLoading}>
                    {addLoading ? 'Creating…' : 'Create User'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>
              Loading users…
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="user-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Notes</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <>
                      <tr key={u.id}>
                        <td>
                          <div className="user-name">{u.username}</div>
                          <div className="user-email">{u.email}</div>
                        </td>
                        <td>
                          <span className={`role-badge ${u.role}`}>{u.role}</span>
                        </td>
                        <td>{u.note_count}</td>
                        <td>
                          <span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{formatDate(u.created_at)}</td>
                        <td>
                          {u.id === user.id ? (
                            <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>You</span>
                          ) : (
                            <div className="table-actions">
                              <button className="btn btn-ghost btn-sm"
                                title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                                onClick={() => handleToggleRole(u)}>
                                {u.role === 'admin' ? '↓ User' : '↑ Admin'}
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => setResetId(resetId === u.id ? null : u.id)}>
                                🔑 Reset PW
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => handleToggleActive(u)}>
                                {u.is_active ? '⊘ Disable' : '✓ Enable'}
                              </button>
                              <button className="btn btn-sm" style={{ background: 'rgba(232,74,95,0.07)', color: 'var(--rose)', border: '1px solid rgba(232,74,95,0.2)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}
                                onClick={() => handleClearData(u)}>
                                🗑 Clear Data
                              </button>
                              <button className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(u)}>
                                ✕ Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {resetId === u.id && (
                        <tr key={`reset-${u.id}`}>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="reset-pw-form">
                              <span style={{ fontSize: 13, color: 'var(--text3)', whiteSpace: 'nowrap' }}>New password for {u.username}:</span>
                              <input type="password" placeholder="Min 12 characters" value={resetPw}
                                onChange={e => setResetPw(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleResetPassword(u.id)} />
                              <button className="btn btn-primary btn-sm" style={{ width: 'auto', whiteSpace: 'nowrap' }}
                                onClick={() => handleResetPassword(u.id)}>
                                Set Password
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => { setResetId(null); setResetPw('') }}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Security notice */}
        <div className="security-badge" style={{ maxWidth: 600 }}>
          <span>⚠</span>
          <span>
            Admin password reset is a <strong>destructive last resort</strong> — it generates a new encryption salt and existing notes become permanently unreadable.
            Users should change their own password via <strong>Account → Change Password</strong> while logged in, which safely re-encrypts all notes.
          </span>
        </div>

        {/* Danger Zone */}
        <div style={{ maxWidth: 700, marginTop: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
            color: 'var(--rose)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(232,74,95,0.25)', display: 'block' }}/>
            ⚠ Danger Zone
            <span style={{ flex: 1, height: 1, background: 'rgba(232,74,95,0.25)', display: 'block' }}/>
          </div>
          <div style={{ background: 'rgba(232,74,95,0.05)', border: '1px solid rgba(232,74,95,0.25)',
            borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(232,74,95,0.15)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Clear all user data</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                  Permanently delete every note, bookmark, and folder for all users on this server.<br/>
                  User accounts will remain. This cannot be undone.
                </div>
              </div>
              <button
                onClick={handleClearAllData}
                style={{ flexShrink: 0, marginLeft: 20, padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(232,74,95,0.5)',
                  background: 'rgba(232,74,95,0.1)', color: 'var(--rose)', cursor: 'pointer', fontSize: 13,
                  fontWeight: 600, fontFamily: 'var(--font)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { e.target.style.background = 'rgba(232,74,95,0.2)' }}
                onMouseLeave={e => { e.target.style.background = 'rgba(232,74,95,0.1)' }}>
                🗑 Clear all data
              </button>
            </div>
            <div style={{ padding: '12px 22px' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                To clear a single user's data, use the <strong style={{ color: 'var(--text2)' }}>Clear Data</strong> button in the user table above.
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
