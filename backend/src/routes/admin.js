const express = require('express');
const argon2 = require('argon2');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { getDb } = require('../models/db');
const { generateSalt } = require('../utils/crypto');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

// GET /api/admin/users - list all users with note counts
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
  res.json({ users });
});

// POST /api/admin/users - create user
router.post('/users', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
    email: z.string().email().max(255),
    password: z.string().min(12).max(128),
    role: z.enum(['admin', 'user']).default('user'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { username, email, password, role } = parsed.data;
  const db = getDb();

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    const encryptionSalt = generateSalt();
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, encryption_salt, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, username, email, passwordHash, encryptionSalt, role, now, now);

    res.status(201).json({ user: { id, username, email, role, is_active: 1, note_count: 0, created_at: now } });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id - update role or active status
router.patch('/users/:id', (req, res) => {
  const schema = z.object({
    role: z.enum(['admin', 'user']).optional(),
    is_active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent admin from demoting/deactivating themselves
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot modify your own account from admin panel' });
  }

  const { role, is_active } = parsed.data;
  const newRole = role ?? user.role;
  const newActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;
  const now = Math.floor(Date.now() / 1000);

  db.prepare('UPDATE users SET role = ?, is_active = ?, updated_at = ? WHERE id = ?')
    .run(newRole, newActive, now, req.params.id);

  res.json({ user: { ...user, role: newRole, is_active: newActive } });
});

// DELETE /api/admin/users/:id - delete user and all their notes
router.delete('/users/:id', (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
  const schema = z.object({ password: z.string().min(12).max(128) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password must be at least 12 characters' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const passwordHash = await argon2.hash(parsed.data.password, ARGON2_OPTIONS);
    const encryptionSalt = generateSalt(); // new salt = old notes unreadable, intentional
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE users SET password_hash = ?, encryption_salt = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, encryptionSalt, now, req.params.id);
    res.json({ success: true, warning: 'Existing notes encrypted with the old password are no longer readable.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

// ── Admin: clear a specific user's data ────────────────────────────────────
router.post('/users/:id/clear-data', requireAdmin, (req, res) => {
  const db = getDb();
  try {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

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

// ── Admin: clear ALL users' data ───────────────────────────────────────────
router.post('/clear-all-data', requireAdmin, (req, res) => {
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
