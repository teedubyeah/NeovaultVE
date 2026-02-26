const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310000; // OWASP recommended minimum
const PBKDF2_DIGEST = 'sha256';

const PEPPER = process.env.ENCRYPTION_PEPPER || 'default-pepper-change-in-production';

/**
 * Derive a per-user encryption key from password + salt + pepper.
 * The key never leaves the server and is derived fresh each request.
 */
function deriveKey(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const pepperedPassword = password + PEPPER;
  return crypto.pbkdf2Sync(pepperedPassword, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Generate a new random salt for a user (stored in DB, not secret).
 */
function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns { encrypted, iv, authTag } all as hex strings.
 */
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt a hex-encoded ciphertext with AES-256-GCM.
 */
function decrypt(encryptedHex, ivHex, authTagHex, key) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Encrypt a full note object. Each note gets its own IV.
 * All sensitive fields are encrypted; metadata (pinned, archived, timestamps) is not.
 */
function encryptNote(note, key) {
  // We use a single IV per note for all fields (deterministic per-field would reveal duplicates)
  const iv = crypto.randomBytes(IV_LENGTH);
  
  function encryptField(value) {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return { encrypted: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
  }

  const titleEnc = encryptField(note.title || '');
  const contentEnc = encryptField(note.content || '');
  const colorEnc = encryptField(note.color || 'default');
  const labelsEnc = encryptField(JSON.stringify(note.labels || []));

  // We combine authTags in order: title|content|color|labels
  const combinedAuthTag = [
    titleEnc.authTag,
    contentEnc.authTag,
    colorEnc.authTag,
    labelsEnc.authTag,
  ].join(':');

  return {
    encrypted_title: titleEnc.encrypted,
    encrypted_content: contentEnc.encrypted,
    encrypted_color: colorEnc.encrypted,
    encrypted_labels: labelsEnc.encrypted,
    iv: iv.toString('hex'),
    auth_tag: combinedAuthTag,
  };
}

/**
 * Decrypt a note row from the database.
 */
function decryptNote(row, key) {
  const iv = Buffer.from(row.iv, 'hex');
  const [titleTag, contentTag, colorTag, labelsTag] = row.auth_tag.split(':');

  function decryptField(encHex, authTagHex) {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  }

  return {
    id: row.id,
    title: decryptField(row.encrypted_title, titleTag),
    content: decryptField(row.encrypted_content, contentTag),
    color: decryptField(row.encrypted_color, colorTag),
    labels: JSON.parse(decryptField(row.encrypted_labels, labelsTag)),
    is_pinned: Boolean(row.is_pinned),
    is_archived: Boolean(row.is_archived),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}


/**
 * Encrypt a bookmark object (title, url, description).
 */
function encryptBookmark(bookmark, key) {
  const iv = crypto.randomBytes(IV_LENGTH);

  function encryptField(value) {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
    return { encrypted: encrypted.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
  }

  const titleEnc = encryptField(bookmark.title || '');
  const urlEnc   = encryptField(bookmark.url   || '');
  const descEnc  = encryptField(bookmark.description || '');

  return {
    encrypted_title:       titleEnc.encrypted,
    encrypted_url:         urlEnc.encrypted,
    encrypted_description: descEnc.encrypted,
    iv:       iv.toString('hex'),
    auth_tag: [titleEnc.authTag, urlEnc.authTag, descEnc.authTag].join(':'),
  };
}

/**
 * Decrypt a bookmark row from the database.
 */
function decryptBookmark(row, key) {
  const iv = Buffer.from(row.iv, 'hex');
  const [titleTag, urlTag, descTag] = row.auth_tag.split(':');

  function decryptField(encHex, authTagHex) {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
  }

  return {
    id:          row.id,
    folder_id:   row.folder_id,
    title:       decryptField(row.encrypted_title, titleTag),
    url:         decryptField(row.encrypted_url, urlTag),
    description: decryptField(row.encrypted_description, descTag),
    is_favorite: Boolean(row.is_favorite),
    sort_order:  row.sort_order,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
  };
}

/**
 * Encrypt a folder name.
 */
function encryptFolder(folder, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(String(folder.name || ''), 'utf8'), cipher.final()]);
  return {
    encrypted_name: encrypted.toString('hex'),
    iv:       iv.toString('hex'),
    auth_tag: cipher.getAuthTag().toString('hex'),
  };
}

/**
 * Decrypt a folder row from the database.
 */
function decryptFolder(row, key) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(row.iv, 'hex'), { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
  const name = Buffer.concat([decipher.update(Buffer.from(row.encrypted_name, 'hex')), decipher.final()]).toString('utf8');
  return {
    id:         row.id,
    parent_id:  row.parent_id,
    name,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = { deriveKey, generateSalt, encrypt, decrypt, encryptNote, decryptNote, encryptBookmark, decryptBookmark, encryptFolder, decryptFolder };
