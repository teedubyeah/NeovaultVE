const jwt       = require('jsonwebtoken');
const { getDb }     = require('../models/db');
const { deriveKey } = require('../utils/crypto');

// ── Startup guard ─────────────────────────────────────────────────────────────
// Refuse to start if critical secrets are missing or weak.
// Uses a short delay before exit so Docker captures the log message.
const WEAK_JWT_VALUES = [
  'change-this-secret',
  'change-this-to-a-long-random-secret-in-production',
  '',
  undefined,
  null,
];
const WEAK_PEPPER_VALUES = [
  'default-pepper-change-in-production',
  'change-this-pepper-in-production',
  '',
  undefined,
  null,
];

function fatalConfig(msg) {
  console.error('\n' + '='.repeat(60));
  console.error('  NEOVISIONVE STARTUP FAILED');
  console.error('='.repeat(60));
  console.error('\n  ' + msg);
  console.error('\n  Fix: generate secrets with:');
  console.error('    openssl rand -hex 64   # paste as JWT_SECRET');
  console.error('    openssl rand -hex 64   # paste as ENCRYPTION_PEPPER');
  console.error('\n  Then add them to your .env file and restart.\n');
  console.error('='.repeat(60) + '\n');
  // Short delay so Docker log driver flushes before the process dies
  setTimeout(() => process.exit(1), 500);
}

const JWT_SECRET       = process.env.JWT_SECRET;
const ENCRYPTION_PEPPER = process.env.ENCRYPTION_PEPPER;

if (WEAK_JWT_VALUES.includes(JWT_SECRET)) {
  fatalConfig('JWT_SECRET is missing or is a known weak placeholder value.');
} else if (WEAK_PEPPER_VALUES.includes(ENCRYPTION_PEPPER)) {
  fatalConfig('ENCRYPTION_PEPPER is missing or is a known weak placeholder value.');
} else if (JWT_SECRET.length < 32) {
  fatalConfig('JWT_SECRET is too short — minimum 32 characters required.');
}

// ── Token signing ─────────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: JWT_SECRET ? userId : null }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

// ── requireAuth ───────────────────────────────────────────────────────────────
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
