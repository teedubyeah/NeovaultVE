const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const crypto = require('crypto');
const { getDb } = require('../models/db');
const { requireAuth, requireAuthWithKey } = require('../middleware/auth');
const { encryptNote, decryptNote, encryptBookmark, decryptBookmark, encrypt, decrypt } = require('../utils/crypto');
const { sendShareInvite, validateEmailAddress } = require('../utils/mailer');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * We store shared content in the DB encrypted with a random one-time key
 * (NOT the owner's personal key). That one-time key is embedded in the share
 * token so only the token holder can read the content.
 *
 * Token format: <uuid-share-id>.<32-byte-random-key-hex>
 * The key part is never stored server-side — only the token holder has it.
 */
function makeShareToken(shareId) {
  const key = crypto.randomBytes(32).toString('hex');
  return { token: `${shareId}.${key}`, shareKey: Buffer.from(key, 'hex') };
}

function parseShareToken(rawToken) {
  const dot = rawToken.indexOf('.');
  if (dot === -1) return null;
  const shareId = rawToken.slice(0, dot);
  const keyHex  = rawToken.slice(dot + 1);
  if (keyHex.length !== 64) return null;
  return { shareId, shareKey: Buffer.from(keyHex, 'hex') };
}

function encryptSharedContent(plainObj, shareKey) {
  const iv       = crypto.randomBytes(16);
  const cipher   = crypto.createCipheriv('aes-256-gcm', shareKey, iv, { authTagLength: 16 });
  const plaintext = JSON.stringify(plainObj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encrypted_content: encrypted.toString('hex'),
    iv:       iv.toString('hex'),
    auth_tag: cipher.getAuthTag().toString('hex'),
  };
}

function decryptSharedContent(row, shareKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', shareKey, Buffer.from(row.iv, 'hex'), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_content, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString('utf8'));
}

// ══════════════════════════════════════════════════════
//  POST /api/share — create a share
// ══════════════════════════════════════════════════════
router.post('/', requireAuthWithKey, async (req, res) => {
  const schema = z.object({
    item_type:       z.enum(['note', 'bookmark']),
    item_id:         z.string().uuid(),
    recipient_email: z.string().email(),
    message:         z.string().max(500).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { item_type, item_id, recipient_email, message } = parsed.data;

  // Second validation layer — blocks nodemailer CVEs (group DoS + quoted @ misrouting)
  // even if Zod's .email() lets a malicious address through.
  try { validateEmailAddress(recipient_email); }
  catch (e) { return res.status(400).json({ error: 'Invalid recipient email address' }); }

  const db = getDb();

  try {
    // Fetch & decrypt the item
    let itemData;
    if (item_type === 'note') {
      const row = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(item_id, req.user.id);
      if (!row) return res.status(404).json({ error: 'Note not found' });
      itemData = decryptNote(row, req.encryptionKey);
    } else {
      const row = db.prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?').get(item_id, req.user.id);
      if (!row) return res.status(404).json({ error: 'Bookmark not found' });
      itemData = decryptBookmark(row, req.encryptionKey);
    }

    // Check if this item is already shared with this email (prevent duplicates)
    const existing = db.prepare(
      'SELECT id FROM shared_items WHERE owner_id = ? AND item_id = ? AND recipient_email = ? AND (expires_at IS NULL OR expires_at > unixepoch())'
    ).get(req.user.id, item_id, recipient_email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Already shared with this address' });

    // Find recipient user if they already have an account
    const recipientUser = db.prepare('SELECT id FROM users WHERE email = ?').get(recipient_email.toLowerCase());

    const shareId  = uuidv4();
    const { token, shareKey } = makeShareToken(shareId);
    const enc      = encryptSharedContent({ item_type, item: itemData }, shareKey);
    const now      = Math.floor(Date.now() / 1000);
    const expiresAt = now + 30 * 24 * 60 * 60; // 30 days

    db.prepare(`
      INSERT INTO shared_items
        (id, owner_id, item_type, item_id, recipient_email, recipient_id, token,
         encrypted_content, iv, auth_tag, message, accepted, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      shareId, req.user.id, item_type, item_id,
      recipient_email.toLowerCase(),
      recipientUser?.id || null,
      token,
      enc.encrypted_content, enc.iv, enc.auth_tag,
      message || null,
      now, expiresAt
    );

    // Send email
    const itemTitle = item_type === 'note' ? (itemData.title || 'Untitled note') : (itemData.title || itemData.url);
    await sendShareInvite({
      toEmail:      recipient_email,
      fromUsername: req.user.username,
      itemType:     item_type,
      itemTitle,
      token,
      message: message || null,
    });

    res.status(201).json({ success: true, share_id: shareId });
  } catch (err) {
    console.error('Share error:', err);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// ══════════════════════════════════════════════════════
//  GET /api/share/sent — list items I've shared
// ══════════════════════════════════════════════════════
router.get('/sent', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id, s.item_type, s.item_id, s.recipient_email, s.message,
           s.accepted, s.created_at, s.expires_at,
           u.username as recipient_username
    FROM shared_items s
    LEFT JOIN users u ON u.email = s.recipient_email
    WHERE s.owner_id = ?
    ORDER BY s.created_at DESC
  `).all(req.user.id);
  res.json({ shares: rows });
});

// ══════════════════════════════════════════════════════
//  GET /api/share/received — list shares sent to me
// ══════════════════════════════════════════════════════
router.get('/received', requireAuth, (req, res) => {
  const db = getDb();
  // Match by both registered email AND recipient_id
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  const rows = db.prepare(`
    SELECT s.id, s.item_type, s.message, s.accepted, s.created_at, s.expires_at,
           u.username as owner_username, u.email as owner_email
    FROM shared_items s
    JOIN users u ON u.id = s.owner_id
    WHERE (s.recipient_email = ? OR s.recipient_id = ?)
      AND (s.expires_at IS NULL OR s.expires_at > unixepoch())
    ORDER BY s.created_at DESC
  `).all(user.email, req.user.id);
  res.json({ shares: rows });
});

// ══════════════════════════════════════════════════════
//  GET /api/share/preview/:token — read shared content
//  (no auth required — token IS the credential)
// ══════════════════════════════════════════════════════
router.get('/preview/:token', (req, res) => {
  const parsed = parseShareToken(req.params.token);
  if (!parsed) return res.status(400).json({ error: 'Invalid token' });

  const db  = getDb();
  const row = db.prepare('SELECT * FROM shared_items WHERE id = ?').get(parsed.shareId);
  if (!row) return res.status(404).json({ error: 'Share not found' });
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(410).json({ error: 'This share link has expired' });
  }

  try {
    const content = decryptSharedContent(row, parsed.shareKey);
    const owner   = db.prepare('SELECT username FROM users WHERE id = ?').get(row.owner_id);
    res.json({
      share_id:       row.id,
      item_type:      row.item_type,
      message:        row.message,
      owner_username: owner?.username,
      created_at:     row.created_at,
      expires_at:     row.expires_at,
      already_accepted: Boolean(row.accepted),
      content,
    });
  } catch (err) {
    res.status(403).json({ error: 'Failed to decrypt — token may be invalid' });
  }
});

// ══════════════════════════════════════════════════════
//  POST /api/share/accept/:token — accept a share
//  (requires auth — saves item into the user's vault)
// ══════════════════════════════════════════════════════
router.post('/accept/:token', requireAuthWithKey, (req, res) => {
  const parsed = parseShareToken(req.params.token);
  if (!parsed) return res.status(400).json({ error: 'Invalid token' });

  const db  = getDb();
  const row = db.prepare('SELECT * FROM shared_items WHERE id = ?').get(parsed.shareId);
  if (!row) return res.status(404).json({ error: 'Share not found' });
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(410).json({ error: 'This share link has expired' });
  }

  // Check user is allowed (either email matches or it's an open link)
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (row.recipient_email && row.recipient_email !== user.email) {
    return res.status(403).json({ error: 'This share was not sent to your account' });
  }

  try {
    const { item_type, item } = decryptSharedContent(row, parsed.shareKey);
    const now = Math.floor(Date.now() / 1000);
    const newId = uuidv4();

    if (item_type === 'note') {
      const enc = encryptNote({
        title:       item.title || '',
        content:     item.content || '',
        color:       item.color || 'default',
        labels:      item.labels || [],
        is_pinned:   false,
        is_archived: false,
      }, req.encryptionKey);
      db.prepare(`
        INSERT INTO notes (id, user_id, encrypted_title, encrypted_content, encrypted_color, encrypted_labels, iv, auth_tag, is_pinned, is_archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `).run(newId, req.user.id, enc.encrypted_title, enc.encrypted_content, enc.encrypted_color, enc.encrypted_labels, enc.iv, enc.auth_tag, now, now);
    } else {
      const enc = encryptBookmark({
        title:       item.title || '',
        url:         item.url || '',
        description: item.description || '',
      }, req.encryptionKey);
      db.prepare(`
        INSERT INTO bookmarks (id, user_id, folder_id, encrypted_title, encrypted_url, encrypted_description, iv, auth_tag, is_favorite, sort_order, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `).run(newId, req.user.id, enc.encrypted_title, enc.encrypted_url, enc.encrypted_description, enc.iv, enc.auth_tag, now, now);
    }

    // Mark as accepted and link recipient
    db.prepare('UPDATE shared_items SET accepted = 1, recipient_id = ? WHERE id = ?').run(req.user.id, row.id);

    res.json({ success: true, item_type, new_id: newId });
  } catch (err) {
    console.error('Accept share error:', err);
    res.status(500).json({ error: 'Failed to save shared item to vault' });
  }
});

// ══════════════════════════════════════════════════════
//  DELETE /api/share/:id — revoke a share I created
// ══════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM shared_items WHERE id = ? AND owner_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Share not found' });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════
//  GET /api/share/shared-with-item/:itemId
//  — list who a specific item is shared with
// ══════════════════════════════════════════════════════
router.get('/shared-with-item/:itemId', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, recipient_email, accepted, created_at, expires_at
    FROM shared_items WHERE owner_id = ? AND item_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id, req.params.itemId);
  res.json({ shares: rows });
});

module.exports = router;
