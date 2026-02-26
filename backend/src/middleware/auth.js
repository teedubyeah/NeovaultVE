const jwt = require('jsonwebtoken');
const { getDb } = require('../models/db');
const { deriveKey } = require('../utils/crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }
    next();
  });
}

function requireAuthWithKey(req, res, next) {
  requireAuth(req, res, () => {
    const password = req.headers['x-password'];
    if (!password) {
      return res.status(400).json({ error: 'Missing X-Password header for encryption' });
    }
    req.encryptionKey = deriveKey(password, req.user.encryption_salt);
    next();
  });
}

module.exports = { signToken, requireAuth, requireAdmin, requireAuthWithKey };
