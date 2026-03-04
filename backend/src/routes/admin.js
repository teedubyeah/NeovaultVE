const express    = require('express');
const argon2     = require('argon2');
const { v4: uuidv4 } = require('uuid');
const { z }      = require('zod');
const { getDb }  = require('../models/db');
const { generateSalt } = require('../utils/crypto');
const { requireAdmin } = require('../middleware/auth');
const { sendTestEmail, getSmtpStatus } = require('../utils/mailer');

const router = express.Router();
// Every route in this file requires admin role
router.use(requireAdmin);

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

// Safe user projection — never returns password_hash or encryption_salt
function safeUser(u) {
  return {
    id:         u.id,
    username:   u.username,
    email:      u.email,
    role:       u.role,
    is_active:  u.is_active,
    note_count: u.note_count ?? undefined,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

// ── GET /api/admin/users ───────────────────────────────────────────────────────
// Explicit column list — never selects password_hash or encryption_salt
router.get('/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.updated_at,
           COUNT(n.id) as note_count
    FROM users u
    LEFT JOIN notes n ON n.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all();
  res.json({ users: users.map(safeUser) });
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
    email:    z.string().email().max(255),
    password: z.string().min(12).max(128),
    role:     z.enum(['admin', 'user']).default('user'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { username, email, password, role } = parsed.data;
  const db = getDb();

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });

    const passwordHash   = await argon2.hash(password, ARGON2_OPTIONS);
    const encryptionSalt = generateSalt();
    const id             = uuidv4();
    const now            = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, encryption_salt, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, username, email, passwordHash, encryptionSalt, role, now, now);

    res.status(201).json({ user: safeUser({ id, username, email, role, is_active: 1, note_count: 0, created_at: now, updated_at: now }) });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────────
router.patch('/users/:id', (req, res) => {
  const schema = z.object({
    role:      z.enum(['admin', 'user']).optional(),
    is_active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  const db = getDb();
  // Explicit column list — no password_hash or encryption_salt
  const user = db.prepare(`
    SELECT id, username, email, role, is_active, created_at, updated_at
    FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot modify your own account from admin panel' });

  const { role, is_active } = parsed.data;
  const newRole   = role      ?? user.role;
  const newActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;
  const now       = Math.floor(Date.now() / 1000);

  db.prepare('UPDATE users SET role = ?, is_active = ?, updated_at = ? WHERE id = ?')
    .run(newRole, newActive, now, req.params.id);

  res.json({ user: safeUser({ ...user, role: newRole, is_active: newActive, updated_at: now }) });
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });

  const db   = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── POST /api/admin/users/:id/reset-password ──────────────────────────────────
router.post('/users/:id/reset-password', async (req, res) => {
  const schema = z.object({ password: z.string().min(12).max(128) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password must be at least 12 characters' });

  const db   = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const passwordHash   = await argon2.hash(parsed.data.password, ARGON2_OPTIONS);
    const encryptionSalt = generateSalt();
    const now            = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE users SET password_hash = ?, encryption_salt = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, encryptionSalt, now, req.params.id);
    res.json({ success: true, warning: 'Existing notes encrypted with the old password are no longer readable.' });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── POST /api/admin/users/:id/clear-data ──────────────────────────────────────
router.post('/users/:id/clear-data', (req, res) => {
  const db   = getDb();
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const stats = db.transaction(() => {
      const notes     = db.prepare('DELETE FROM notes WHERE user_id = ?').run(req.params.id);
      const bookmarks = db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(req.params.id);
      const folders   = db.prepare('DELETE FROM bookmark_folders WHERE user_id = ?').run(req.params.id);
      return { notes: notes.changes, bookmarks: bookmarks.changes, folders: folders.changes };
    })();
    res.json({ success: true, username: user.username, deleted: stats });
  } catch (err) {
    console.error('Admin clear data error:', err);
    res.status(500).json({ error: 'Failed to clear user data' });
  }
});

// ── POST /api/admin/clear-all-data ───────────────────────────────────────────
router.post('/clear-all-data', (req, res) => {
  const db = getDb();
  try {
    const stats = db.transaction(() => {
      const notes     = db.prepare('DELETE FROM notes').run();
      const bookmarks = db.prepare('DELETE FROM bookmarks').run();
      const folders   = db.prepare('DELETE FROM bookmark_folders').run();
      return { notes: notes.changes, bookmarks: bookmarks.changes, folders: folders.changes };
    })();
    res.json({ success: true, deleted: stats });
  } catch (err) {
    console.error('Admin clear all data error:', err);
    res.status(500).json({ error: 'Failed to clear all data' });
  }
});

// ── GET /api/admin/smtp ───────────────────────────────────────────────────────
// Returns config with password masked — has_password: true/false, never the value
router.get('/smtp', (req, res) => {
  res.json(getSmtpStatus());
});

// ── POST /api/admin/smtp ──────────────────────────────────────────────────────
router.post('/smtp', (req, res) => {
  const schema = z.object({
    mode:         z.enum(['console', 'anonymous', 'custom']),
    host:         z.string().max(255).optional().default(''),
    port:         z.number().int().min(1).max(65535).optional().default(587),
    secure:       z.boolean().optional().default(false),
    user:         z.string().max(255).optional().default(''),
    pass:         z.string().max(1000).optional(),
    from_address: z.string().max(255).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { mode, host, port, secure, user, pass, from_address } = parsed.data;
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);

  // If pass is omitted or empty, preserve the existing saved password
  const existing  = db.prepare('SELECT pass FROM smtp_settings WHERE id = 1').get();
  const finalPass = (pass !== undefined && pass !== '') ? pass : (existing?.pass || null);

  db.prepare(`
    INSERT INTO smtp_settings (id, mode, host, port, secure, user, pass, from_address, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mode=excluded.mode, host=excluded.host, port=excluded.port, secure=excluded.secure,
      user=excluded.user, pass=excluded.pass, from_address=excluded.from_address, updated_at=excluded.updated_at
  `).run(mode, host || null, port, secure ? 1 : 0, user || null, finalPass, from_address || null, now);

  res.json({ success: true, status: getSmtpStatus() });
});

// ── POST /api/admin/smtp/test ─────────────────────────────────────────────────
router.post('/smtp/test', async (req, res) => {
  const schema = z.object({
    to:           z.string().email(),
    mode:         z.enum(['console', 'anonymous', 'custom']),
    host:         z.string().optional().default(''),
    port:         z.number().int().optional().default(587),
    secure:       z.boolean().optional().default(false),
    user:         z.string().optional().default(''),
    pass:         z.string().optional().default(''),
    from_address: z.string().optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  const { to, ...cfg } = parsed.data;

  // If no password sent, fall back to the saved password
  if (!cfg.pass) {
    const db    = getDb();
    const saved = db.prepare('SELECT pass FROM smtp_settings WHERE id = 1').get();
    if (saved?.pass) cfg.pass = saved.pass;
  }

  try {
    await sendTestEmail(to, cfg);
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    console.error('SMTP test error:', err);
    // Return a generic message — do not leak SMTP server internals to the client
    res.status(400).json({ error: 'Failed to send test email. Check your SMTP credentials and try again.' });
  }
});

// module.exports MUST remain at the very end so all routes above are registered.
module.exports = router;
