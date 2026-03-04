const jwt    = require('jsonwebtoken');
const { getDb }    = require('../models/db');
const { deriveKey } = require('../utils/crypto');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Startup guard ─────────────────────────────────────────────────────────────
// Refuse to start if critical secrets are missing or still set to known-weak defaults.
// This prevents silent operation with insecure credentials.
const WEAK_JWT_VALUES = [
  'change-this-secret',
  'change-this-to-a-long-random-secret-in-production',
  '',
  undefined,
];
const WEAK_PEPPER_VALUES = [
  'default-pepper-change-in-production',
  'change-this-pepper-in-production',
  '',
  undefined,
];

if (WEAK_JWT_VALUES.includes(JWT_SECRET)) {
  console.error('\n\u274C FATAL: JWT_SECRET is not set or is a known weak default.');
  console.error('   Generate one with: openssl rand -hex 64');
  console.error('   Then set it in your .env file as JWT_SECRET=<value>\n');
  process.exit(1);
}

if (WEAK_PEPPER_VALUES.includes(process.env.ENCRYPTION_PEPPER)) {
  console.error('\n\u274C FATAL: ENCRYPTION_PEPPER is not set or is a known weak default.');
  console.error('   Generate one with: openssl rand -hex 64');
  console.error('   Then set it in your .env file as ENCRYPTION_PEPPER=<value>\n');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('\n\u274C FATAL: JWT_SECRET is too short (minimum 32 characters).');
  console.error('   Generate one with: openssl rand -hex 64\n');
  process.exit(1);
}

// ── Token signing ─────────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

// ── requireAuth ───────────────────────────────────────────────────────────────
// Validates the Bearer JWT, confirms the user is active, attaches req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const db      = getDb();
    const user    = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── requireAdmin ──────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden: admin only' });
    next();
  });
}

// ── requireAuthWithKey ────────────────────────────────────────────────────────
// Extends requireAuth by also deriving the per-user encryption key from
// the X-Password header. Never stored — derived fresh per request.
function requireAuthWithKey(req, res, next) {
  requireAuth(req, res, () => {
    const password = req.headers['x-password'];
    if (!password)
      return res.status(400).json({ error: 'Missing X-Password header for encryption' });
    req.encryptionKey = deriveKey(password, req.user.encryption_salt);
    next();
  });
}

module.exports = { signToken, requireAuth, requireAdmin, requireAuthWithKey };
