const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { getDb } = require('../models/db');
const { requireAuthWithKey } = require('../middleware/auth');
const { encryptBookmark, decryptBookmark, encryptFolder, decryptFolder } = require('../utils/crypto');
const { parseBookmarkHTML } = require('../utils/bookmarkParser');

const router = express.Router();
router.use(requireAuthWithKey);

// ── Helpers ───────────────────────────────────────────────────────────────

function safeDecryptBookmark(row, key) {
  try { return decryptBookmark(row, key); }
  catch { return { id: row.id, folder_id: row.folder_id, decryption_error: true }; }
}

function safeDecryptFolder(row, key) {
  try { return decryptFolder(row, key); }
  catch { return { id: row.id, parent_id: row.parent_id, name: '[encrypted]', decryption_error: true }; }
}

// ══════════════════════════════════════════════════════
//  FOLDERS
// ══════════════════════════════════════════════════════

// GET /api/bookmarks/folders — all folders for user (flat list, client builds tree)
router.get('/folders', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM bookmark_folders WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id);
    res.json({ folders: rows.map(r => safeDecryptFolder(r, req.encryptionKey)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve folders' });
  }
});

// POST /api/bookmarks/folders
router.post('/folders', (req, res) => {
  const schema = z.object({
    name:      z.string().min(1).max(200),
    parent_id: z.string().uuid().nullable().default(null),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  try {
    const db = getDb();
    // Validate parent belongs to this user
    if (parsed.data.parent_id) {
      const parent = db.prepare('SELECT id FROM bookmark_folders WHERE id = ? AND user_id = ?').get(parsed.data.parent_id, req.user.id);
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
    }
    const id = uuidv4();
    const enc = encryptFolder({ name: parsed.data.name }, req.encryptionKey);
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO bookmark_folders (id, user_id, parent_id, encrypted_name, iv, auth_tag, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(id, req.user.id, parsed.data.parent_id, enc.encrypted_name, enc.iv, enc.auth_tag, now, now);
    res.status(201).json({ folder: { id, parent_id: parsed.data.parent_id, name: parsed.data.name, sort_order: 0, created_at: now, updated_at: now } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /api/bookmarks/folders/:id
router.put('/folders/:id', (req, res) => {
  const schema = z.object({
    name:      z.string().min(1).max(200).optional(),
    parent_id: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM bookmark_folders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Folder not found' });

    // Prevent circular parent
    if (parsed.data.parent_id === req.params.id) return res.status(400).json({ error: 'Folder cannot be its own parent' });

    const now = Math.floor(Date.now() / 1000);
    if (parsed.data.name !== undefined) {
      const enc = encryptFolder({ name: parsed.data.name }, req.encryptionKey);
      db.prepare('UPDATE bookmark_folders SET encrypted_name=?, iv=?, auth_tag=?, updated_at=? WHERE id=? AND user_id=?')
        .run(enc.encrypted_name, enc.iv, enc.auth_tag, now, req.params.id, req.user.id);
    }
    if (parsed.data.parent_id !== undefined) {
      db.prepare('UPDATE bookmark_folders SET parent_id=?, updated_at=? WHERE id=? AND user_id=?')
        .run(parsed.data.parent_id, now, req.params.id, req.user.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// DELETE /api/bookmarks/folders/:id
// Recursively deletes all child folders and their bookmarks
router.delete('/folders/:id', (req, res) => {
  try {
    const db = getDb();
    const folder = db.prepare('SELECT id FROM bookmark_folders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Collect all descendant folder ids
    function collectIds(parentId) {
      const children = db.prepare('SELECT id FROM bookmark_folders WHERE parent_id = ? AND user_id = ?').all(parentId, req.user.id);
      let ids = [parentId];
      for (const c of children) ids = ids.concat(collectIds(c.id));
      return ids;
    }
    const ids = collectIds(req.params.id);

    db.transaction(() => {
      for (const id of ids) {
        db.prepare('DELETE FROM bookmarks WHERE folder_id = ? AND user_id = ?').run(id, req.user.id);
        db.prepare('DELETE FROM bookmark_folders WHERE id = ? AND user_id = ?').run(id, req.user.id);
      }
    })();

    res.json({ success: true, deleted_folders: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ══════════════════════════════════════════════════════
//  BOOKMARKS
// ══════════════════════════════════════════════════════

// GET /api/bookmarks — all bookmarks (optionally filter by folder_id)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = req.query.folder_id
      ? db.prepare('SELECT * FROM bookmarks WHERE user_id = ? AND folder_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id, req.query.folder_id)
      : db.prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY sort_order ASC, updated_at DESC').all(req.user.id);
    res.json({ bookmarks: rows.map(r => safeDecryptBookmark(r, req.encryptionKey)) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve bookmarks' });
  }
});

// GET /api/bookmarks/favorites
router.get('/favorites', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM bookmarks WHERE user_id = ? AND is_favorite = 1 ORDER BY updated_at DESC').all(req.user.id);
    res.json({ bookmarks: rows.map(r => safeDecryptBookmark(r, req.encryptionKey)) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve favorites' });
  }
});

// POST /api/bookmarks
router.post('/', (req, res) => {
  const schema = z.object({
    title:       z.string().max(500).default(''),
    url:         z.string().max(2000),
    description: z.string().max(5000).default(''),
    folder_id:   z.string().uuid().nullable().default(null),
    is_favorite: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  try {
    const db = getDb();
    if (parsed.data.folder_id) {
      const folder = db.prepare('SELECT id FROM bookmark_folders WHERE id = ? AND user_id = ?').get(parsed.data.folder_id, req.user.id);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
    }
    const id = uuidv4();
    const enc = encryptBookmark(parsed.data, req.encryptionKey);
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO bookmarks (id, user_id, folder_id, encrypted_title, encrypted_url, encrypted_description, iv, auth_tag, is_favorite, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(id, req.user.id, parsed.data.folder_id, enc.encrypted_title, enc.encrypted_url, enc.encrypted_description, enc.iv, enc.auth_tag, parsed.data.is_favorite ? 1 : 0, now, now);
    res.status(201).json({ bookmark: { id, ...parsed.data, created_at: now, updated_at: now } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

// PUT /api/bookmarks/:id
router.put('/:id', (req, res) => {
  const schema = z.object({
    title:       z.string().max(500).default(''),
    url:         z.string().max(2000),
    description: z.string().max(5000).default(''),
    folder_id:   z.string().uuid().nullable().default(null),
    is_favorite: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Bookmark not found' });

    const enc = encryptBookmark(parsed.data, req.encryptionKey);
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE bookmarks SET folder_id=?, encrypted_title=?, encrypted_url=?, encrypted_description=?, iv=?, auth_tag=?, is_favorite=?, updated_at=? WHERE id=? AND user_id=?`)
      .run(parsed.data.folder_id, enc.encrypted_title, enc.encrypted_url, enc.encrypted_description, enc.iv, enc.auth_tag, parsed.data.is_favorite ? 1 : 0, now, req.params.id, req.user.id);
    res.json({ bookmark: { id: req.params.id, ...parsed.data, updated_at: now } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

// DELETE /api/bookmarks/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Bookmark not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// PATCH /api/bookmarks/:id/move — move bookmark to a different folder
router.patch('/:id/move', (req, res) => {
  const schema = z.object({ folder_id: z.string().uuid().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });
  try {
    const db = getDb();
    const bm = db.prepare('SELECT id FROM bookmarks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!bm) return res.status(404).json({ error: 'Bookmark not found' });
    if (parsed.data.folder_id) {
      const folder = db.prepare('SELECT id FROM bookmark_folders WHERE id = ? AND user_id = ?').get(parsed.data.folder_id, req.user.id);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
    }
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE bookmarks SET folder_id = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(parsed.data.folder_id, now, req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to move bookmark' });
  }
});


// ══════════════════════════════════════════════════════
//  IMPORT — Phase 1: Preview (parse + diff, no writes)
// ══════════════════════════════════════════════════════
//
//  Returns three categories:
//    exact_duplicates  — same URL, same title: will be silently skipped
//    conflicts         — same URL, different title or folder path: needs user decision
//    new_items         — no existing bookmark with this URL: will be inserted
//
//  Each item carries its full folder path so the UI can display context.

router.post('/import/preview', (req, res) => {
  const schema = z.object({ html: z.string().max(10_000_000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid import data' });

  try {
    const db     = getDb();
    const userId = req.user.id;
    const key    = req.encryptionKey;

    // ── Decrypt all existing bookmarks and folders for comparison ──────────
    const existingFolderRows   = db.prepare('SELECT * FROM bookmark_folders WHERE user_id = ?').all(userId);
    const existingBookmarkRows = db.prepare('SELECT * FROM bookmarks WHERE user_id = ?').all(userId);

    const existingFolders   = existingFolderRows.map(r => { try { return decryptFolder(r, key) } catch { return null } }).filter(Boolean);
    const existingBookmarks = existingBookmarkRows.map(r => { try { return decryptBookmark(r, key) } catch { return null } }).filter(Boolean);

    // Build folder path lookup: id -> "Parent / Child / ..."
    const folderById = Object.fromEntries(existingFolders.map(f => [f.id, f]));
    function folderPath(folderId) {
      if (!folderId) return null;
      const parts = [];
      let cur = folderId;
      const visited = new Set();
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        const f = folderById[cur];
        if (!f) break;
        parts.unshift(f.name);
        cur = f.parent_id;
      }
      return parts.join(' / ') || null;
    }

    // URL-normalised map of existing bookmarks (lowercase, stripped trailing slash)
    function normaliseUrl(url) {
      try { const u = new URL(url); return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '') + (u.search || '') }
      catch { return (url || '').toLowerCase().trim() }
    }

    const existingByUrl = {};
    for (const bm of existingBookmarks) {
      const key = normaliseUrl(bm.url);
      if (!existingByUrl[key]) existingByUrl[key] = [];
      existingByUrl[key].push({ ...bm, folderPath: folderPath(bm.folder_id) });
    }

    // ── Parse the import file ──────────────────────────────────────────────
    const tree = parseBookmarkHTML(parsed.data.html);

    // Flatten tree into bookmark list, carrying folder path string
    function flattenBookmarks(nodes, pathParts = []) {
      const out = [];
      for (const node of nodes) {
        if (node.type === 'folder') {
          out.push(...flattenBookmarks(node.children || [], [...pathParts, node.name]));
        } else if (node.type === 'bookmark') {
          out.push({ ...node, folderPath: pathParts.length ? pathParts.join(' / ') : null, pathParts });
        }
      }
      return out;
    }

    // Collect unique folder names from tree (for folder dedup info)
    function flattenFolders(nodes, pathParts = []) {
      const out = [];
      for (const node of nodes) {
        if (node.type === 'folder') {
          const fullPath = [...pathParts, node.name];
          out.push({ name: node.name, path: fullPath.join(' / '), depth: pathParts.length });
          out.push(...flattenFolders(node.children || [], fullPath));
        }
      }
      return out;
    }

    const incomingBookmarks = flattenBookmarks(tree);
    const incomingFolders   = flattenFolders(tree);

    // Dedup incoming list itself (same file can have duplicates)
    const seenIncoming = new Set();
    const deduped = [];
    for (const bm of incomingBookmarks) {
      const k = normaliseUrl(bm.url);
      if (!seenIncoming.has(k)) { seenIncoming.add(k); deduped.push(bm); }
    }

    // ── Categorise each incoming bookmark ─────────────────────────────────
    const exactDuplicates = [];
    const conflicts       = [];
    const newItems        = [];

    for (const incoming of deduped) {
      const normUrl = normaliseUrl(incoming.url);
      const matches = existingByUrl[normUrl] || [];

      if (matches.length === 0) {
        newItems.push(incoming);
        continue;
      }

      // Check if any existing match is identical (same title, same folder path)
      const exactMatch = matches.find(ex =>
        (ex.title || '').trim().toLowerCase() === (incoming.title || '').trim().toLowerCase() &&
        (ex.folderPath || null) === (incoming.folderPath || null)
      );

      if (exactMatch) {
        exactDuplicates.push({ incoming, existing: exactMatch });
      } else {
        // Conflict: same URL, but something differs
        conflicts.push({
          incoming,
          existing: matches[0], // primary existing entry to compare against
          allExisting: matches,
          differences: {
            title:  (incoming.title || '') !== (matches[0].title || ''),
            folder: (incoming.folderPath || null) !== (matches[0].folderPath || null),
          },
        });
      }
    }

    // ── Count existing folders that would be merged / created ─────────────
    // Build a set of existing folder paths
    function buildExistingPaths() {
      const paths = new Set();
      function walk(folderId, acc) {
        const f = folderById[folderId];
        if (!f) return;
        const path = acc ? acc + ' / ' + f.name : f.name;
        paths.add(path.toLowerCase());
        // find children
        existingFolders.filter(cf => cf.parent_id === folderId).forEach(cf => walk(cf.id, path));
      }
      existingFolders.filter(f => !f.parent_id).forEach(f => {
        const path = f.name;
        paths.add(path.toLowerCase());
        existingFolders.filter(cf => cf.parent_id === f.id).forEach(cf => walk(cf.id, path));
      });
      return paths;
    }

    const existingPaths = buildExistingPaths();
    const newFolders  = incomingFolders.filter(f => !existingPaths.has(f.path.toLowerCase()));
    const mergedFolders = incomingFolders.filter(f => existingPaths.has(f.path.toLowerCase()));

    res.json({
      summary: {
        new_bookmarks:    newItems.length,
        conflicts:        conflicts.length,
        exact_duplicates: exactDuplicates.length,
        new_folders:      newFolders.length,
        merged_folders:   mergedFolders.length,
      },
      new_items:        newItems,
      conflicts,
      exact_duplicates: exactDuplicates,
    });

  } catch (err) {
    console.error('Import preview error:', err);
    res.status(500).json({ error: 'Preview failed: ' + err.message });
  }
});


// ══════════════════════════════════════════════════════
//  IMPORT — Phase 2: Confirm (write resolved items)
// ══════════════════════════════════════════════════════
//
//  Body: {
//    html: string,                     — original file (to re-parse folder structure)
//    resolutions: {                    — user's decisions for each conflict
//      [normalisedUrl]: 'keep_existing' | 'keep_incoming' | 'keep_both'
//    }
//  }

router.post('/import/confirm', (req, res) => {
  const schema = z.object({
    html:        z.string().max(10_000_000),
    resolutions: z.record(z.enum(['keep_existing', 'keep_incoming', 'keep_both'])).default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

  try {
    const db     = getDb();
    const now    = Math.floor(Date.now() / 1000);
    const userId = req.user.id;
    const key    = req.encryptionKey;
    const { html, resolutions } = parsed.data;

    // Decrypt existing for comparison
    const existingFolderRows   = db.prepare('SELECT * FROM bookmark_folders WHERE user_id = ?').all(userId);
    const existingBookmarkRows = db.prepare('SELECT * FROM bookmarks WHERE user_id = ?').all(userId);
    const existingFolders   = existingFolderRows.map(r => { try { return { ...decryptFolder(r, key), _rowId: r.id } } catch { return null } }).filter(Boolean);
    const existingBookmarks = existingBookmarkRows.map(r => { try { return { ...decryptBookmark(r, key), _rowId: r.id } } catch { return null } }).filter(Boolean);

    function normaliseUrl(url) {
      try { const u = new URL(url); return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '') + (u.search || '') }
      catch { return (url || '').toLowerCase().trim() }
    }

    const existingByUrl = {};
    for (const bm of existingBookmarks) {
      const k = normaliseUrl(bm.url);
      if (!existingByUrl[k]) existingByUrl[k] = [];
      existingByUrl[k].push(bm);
    }

    // Build existing folder path → id map for merging
    const folderById = Object.fromEntries(existingFolders.map(f => [f.id, f]));
    function folderPath(folderId) {
      if (!folderId) return '';
      const parts = []; let cur = folderId; const vis = new Set();
      while (cur && !vis.has(cur)) { vis.add(cur); const f = folderById[cur]; if (!f) break; parts.unshift(f.name); cur = f.parent_id; }
      return parts.join(' / ');
    }

    // Map of lower-cased path → existing folder id
    const existingPathToId = {};
    for (const f of existingFolders) {
      existingPathToId[folderPath(f.id).toLowerCase()] = f.id;
    }

    // Re-parse the tree
    const tree = parseBookmarkHTML(html);

    let foldersCreated = 0, bookmarksCreated = 0, bookmarksUpdated = 0, bookmarksSkipped = 0;

    // Recursively walk the tree, creating or merging folders, inserting bookmarks per resolution
    function processNode(node, parentFolderId, parentPathParts) {
      if (node.type === 'folder') {
        const pathParts  = [...parentPathParts, node.name];
        const pathString = pathParts.join(' / ').toLowerCase();

        // Reuse existing folder if path matches
        let folderId = existingPathToId[pathString];
        if (!folderId) {
          folderId = uuidv4();
          const enc = encryptFolder({ name: node.name }, key);
          db.prepare(`INSERT INTO bookmark_folders (id, user_id, parent_id, encrypted_name, iv, auth_tag, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
            .run(folderId, userId, parentFolderId, enc.encrypted_name, enc.iv, enc.auth_tag, now, now);
          // Register it so nested subfolders can find it
          existingPathToId[pathString] = folderId;
          folderById[folderId] = { id: folderId, parent_id: parentFolderId, name: node.name };
          foldersCreated++;
        }

        for (const child of (node.children || [])) processNode(child, folderId, pathParts);

      } else if (node.type === 'bookmark') {
        const normUrl    = normaliseUrl(node.url);
        const resolution = resolutions[normUrl] || 'keep_both'; // default: keep both if not specified
        const existing   = existingByUrl[normUrl] || [];

        if (existing.length > 0) {
          if (resolution === 'keep_existing') {
            bookmarksSkipped++;
            return;
          }
          if (resolution === 'keep_incoming') {
            // Update the first existing entry in-place
            const target = existing[0];
            const enc = encryptBookmark({ title: node.title, url: node.url, description: '' }, key);
            db.prepare(`UPDATE bookmarks SET folder_id=?, encrypted_title=?, encrypted_url=?, encrypted_description=?, iv=?, auth_tag=?, updated_at=? WHERE id=? AND user_id=?`)
              .run(parentFolderId, enc.encrypted_title, enc.encrypted_url, enc.encrypted_description, enc.iv, enc.auth_tag, now, target._rowId, userId);
            bookmarksUpdated++;
            return;
          }
          // keep_both: fall through and insert new
        }

        // Insert new bookmark
        const id  = uuidv4();
        const enc = encryptBookmark({ title: node.title, url: node.url, description: '' }, key);
        db.prepare(`INSERT INTO bookmarks (id, user_id, folder_id, encrypted_title, encrypted_url, encrypted_description, iv, auth_tag, is_favorite, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`)
          .run(id, userId, parentFolderId, enc.encrypted_title, enc.encrypted_url, enc.encrypted_description, enc.iv, enc.auth_tag, now, now);
        bookmarksCreated++;
      }
    }

    db.transaction(() => {
      for (const node of tree) processNode(node, null, []);
    })();

    res.json({
      success: true,
      folders_created:    foldersCreated,
      bookmarks_created:  bookmarksCreated,
      bookmarks_updated:  bookmarksUpdated,
      bookmarks_skipped:  bookmarksSkipped,
    });

  } catch (err) {
    console.error('Import confirm error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});


// ══════════════════════════════════════════════════════
//  EXPORT — Netscape Bookmark HTML
// ══════════════════════════════════════════════════════

router.get('/export', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const folderRows   = db.prepare('SELECT * FROM bookmark_folders WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(userId);
    const bookmarkRows = db.prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(userId);

    const folders   = folderRows.map(r => safeDecryptFolder(r, req.encryptionKey));
    const bookmarks = bookmarkRows.map(r => safeDecryptBookmark(r, req.encryptionKey));

    function escapeHTML(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderFolder(folderId, indent) {
      const pad = '    '.repeat(indent);
      let out = '';
      // Child folders
      const childFolders = folders.filter(f => f.parent_id === folderId);
      for (const f of childFolders) {
        out += `${pad}<DT><H3>${escapeHTML(f.name)}</H3>\n`;
        out += `${pad}<DL><p>\n`;
        out += renderFolder(f.id, indent + 1);
        out += `${pad}</DL><p>\n`;
      }
      // Bookmarks in this folder
      const bms = bookmarks.filter(b => b.folder_id === folderId);
      for (const b of bms) {
        out += `${pad}<DT><A HREF="${escapeHTML(b.url)}">${escapeHTML(b.title)}</A>\n`;
      }
      return out;
    }

    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${renderFolder(null, 1)}</DL>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="neovisionve-bookmarks.html"');
    res.send(html);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
