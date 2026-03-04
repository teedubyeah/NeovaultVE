const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { getDb } = require('../models/db');
const { requireAuthWithKey } = require('../middleware/auth');
const { encryptNote, decryptNote } = require('../utils/crypto');

const router = express.Router();

// All notes routes require auth + encryption key
router.use(requireAuthWithKey);

const NoteSchema = z.object({
  title: z.string().max(500).default(''),
  content: z.string().max(100000).default(''),
  color: z.string().max(50).default('default'),
  labels: z.array(z.string().max(50)).max(20).default([]),
  is_pinned: z.boolean().default(false),
  is_archived: z.boolean().default(false),
});

// GET /api/notes - list all notes for user
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM notes 
      WHERE user_id = ? AND is_archived = 0
      ORDER BY is_pinned DESC, updated_at DESC
    `).all(req.user.id);

    const notes = rows.map(row => {
      try {
        return decryptNote(row, req.encryptionKey);
      } catch (e) {
        // If decryption fails (wrong key), return error indicator
        return { id: row.id, decryption_error: true };
      }
    });

    res.json({ notes });
  } catch (err) {
    console.error('List notes error:', err);
    res.status(500).json({ error: 'Failed to retrieve notes' });
  }
});

// GET /api/notes/archived
router.get('/archived', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM notes 
      WHERE user_id = ? AND is_archived = 1
      ORDER BY updated_at DESC
    `).all(req.user.id);

    const notes = rows.map(row => {
      try { return decryptNote(row, req.encryptionKey); }
      catch (e) { return { id: row.id, decryption_error: true }; }
    });

    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve archived notes' });
  }
});

// POST /api/notes - create note
router.post('/', (req, res) => {
  const parsed = NoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const db = getDb();
    const id = uuidv4();
    const encrypted = encryptNote(parsed.data, req.encryptionKey);
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO notes (id, user_id, encrypted_title, encrypted_content, encrypted_color, encrypted_labels, iv, auth_tag, is_pinned, is_archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.user.id,
      encrypted.encrypted_title, encrypted.encrypted_content,
      encrypted.encrypted_color, encrypted.encrypted_labels,
      encrypted.iv, encrypted.auth_tag,
      parsed.data.is_pinned ? 1 : 0,
      parsed.data.is_archived ? 1 : 0,
      now, now
    );

    res.status(201).json({
      note: { id, ...parsed.data, created_at: now, updated_at: now }
    });
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PUT /api/notes/:id - update note
router.put('/:id', (req, res) => {
  const parsed = NoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed' });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const encrypted = encryptNote(parsed.data, req.encryptionKey);
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      UPDATE notes SET
        encrypted_title = ?, encrypted_content = ?, encrypted_color = ?,
        encrypted_labels = ?, iv = ?, auth_tag = ?,
        is_pinned = ?, is_archived = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      encrypted.encrypted_title, encrypted.encrypted_content,
      encrypted.encrypted_color, encrypted.encrypted_labels,
      encrypted.iv, encrypted.auth_tag,
      parsed.data.is_pinned ? 1 : 0,
      parsed.data.is_archived ? 1 : 0,
      now,
      req.params.id, req.user.id
    );

    res.json({ note: { id: req.params.id, ...parsed.data, updated_at: now } });
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
