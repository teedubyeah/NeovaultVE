const express = require('express');
const argon2 = require('argon2');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { getDb } = require('../models/db');
const { generateSalt, deriveKey, encryptNote, decryptNote } = require('../utils/crypto');
const { signToken, requireAuth, requireAuthWithKey } = require('../middleware/auth');

const router = express.Router();

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

// ── Register ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
    email: z.string().email().max(255),
    password: z.string().min(12).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  const { username, email, password } = parsed.data;
  const db = getDb();

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    const encryptionSalt = generateSalt();
    const id = uuidv4();
    const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
    const role = count.n === 0 ? 'admin' : 'user';

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, encryption_salt, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, username, email, passwordHash, encryptionSalt, role);

    const token = signToken(id);
    res.status(201).json({ token, user: { id, username, email, role } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const schema = z.object({ username: z.string(), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

  const { username, password } = parsed.data;
  const db = getDb();

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$dummysaltdummysaltdummysalt$dummyhashvaluedummyhashvalue';
    const valid = user
      ? await argon2.verify(user.password_hash, password)
      : await argon2.verify(dummyHash, password).catch(() => false);

    if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const { id, username, email, role } = req.user;
  res.json({ id, username, email, role });
});

// ── Change Password ───────────────────────────────────────────────────────
// Requires the current session password (X-Password header) to re-encrypt
// all existing notes with the new key before swapping credentials.
router.post('/change-password', requireAuthWithKey, async (req, res) => {
  const schema = z.object({
    new_password: z.string().min(12).max(128),
    confirm_password: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  const { new_password, confirm_password } = parsed.data;
  if (new_password !== confirm_password) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  // Prevent no-op (changing to the same password would re-encrypt unnecessarily)
  const currentPassword = req.headers['x-password'];
  if (new_password === currentPassword) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }

  const db = getDb();
  const userId = req.user.id;
  const oldKey = req.encryptionKey; // derived from current password by requireAuthWithKey

  try {
    // Generate new credentials
    const newPasswordHash = await argon2.hash(new_password, ARGON2_OPTIONS);
    const newSalt = generateSalt();
    const newKey = deriveKey(new_password, newSalt);

    // Load all notes for this user
    const rows = db.prepare('SELECT * FROM notes WHERE user_id = ?').all(userId);

    // Re-encrypt every note — decrypt with old key, re-encrypt with new key
    const reencrypted = rows.map(row => {
      try {
        const plain = decryptNote(row, oldKey);
        const enc = encryptNote(plain, newKey);
        return { id: row.id, ...enc };
      } catch (e) {
        throw new Error(`Failed to re-encrypt note ${row.id}: ${e.message}`);
      }
    });

    // Commit everything atomically — if any step fails, nothing is changed
    const updateNote = db.prepare(`
      UPDATE notes SET
        encrypted_title = ?, encrypted_content = ?, encrypted_color = ?,
        encrypted_labels = ?, iv = ?, auth_tag = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);

    const updateUser = db.prepare(`
      UPDATE users SET password_hash = ?, encryption_salt = ?, updated_at = ?
      WHERE id = ?
    `);

    const now = Math.floor(Date.now() / 1000);

    // Run in a single SQLite transaction
    db.transaction(() => {
      for (const n of reencrypted) {
        updateNote.run(
          n.encrypted_title, n.encrypted_content, n.encrypted_color,
          n.encrypted_labels, n.iv, n.auth_tag, now,
          n.id, userId
        );
      }
      updateUser.run(newPasswordHash, newSalt, now, userId);
    })();

    res.json({
      success: true,
      notes_reencrypted: reencrypted.length,
      message: `Password changed and ${reencrypted.length} note(s) re-encrypted successfully.`,
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Password change failed. No changes were made.' });
  }
});

module.exports = router;

// ── Clear own data ─────────────────────────────────────────────────────────
// Deletes all notes, bookmarks, and bookmark folders for the authenticated user.
// Requires current password confirmation. Account itself is preserved.
router.post('/clear-data', requireAuthWithKey, async (req, res) => {
  const schema = z.object({ password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password required' });

  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await argon2.verify(user.password_hash, parsed.data.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    const stats = db.transaction(() => {
      const notes     = db.prepare('DELETE FROM notes WHERE user_id = ?').run(req.user.id);
      const bookmarks = db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(req.user.id);
      const folders   = db.prepare('DELETE FROM bookmark_folders WHERE user_id = ?').run(req.user.id);
      return { notes: notes.changes, bookmarks: bookmarks.changes, folders: folders.changes };
    })();

    res.json({ success: true, deleted: stats });
  } catch (err) {
    console.error('Clear data error:', err);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});
