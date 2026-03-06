/**
 * Mailer — reads SMTP config from DB at send-time so admin changes
 * take effect immediately without a restart.
 *
 * Modes (stored in smtp_settings.mode):
 *   'console'   — no email sent; invite link printed to backend logs
 *   'anonymous' — app relay via env-var SMTP_HOST (shared no-reply address)
 *                 WARNING: may be marked as spam by recipient mail servers
 *   'custom'    — admin-supplied SMTP credentials (recommended)
 *
 * Security hardening (defence-in-depth against nodemailer CVEs):
 *   All email addresses are validated by validateEmailAddress() before being
 *   passed to nodemailer. This blocks two known vulnerabilities regardless of
 *   the nodemailer version installed:
 *
 *   CVE-1 — DoS via nested group syntax (addressparser infinite recursion)
 *     Attack: "g0: g1: g2: ... gN: victim@example.com;"
 *     Fix:    Reject any address containing ':' or ';' characters, which are
 *             the group-syntax tokens that trigger the recursive parser path.
 *
 *   CVE-2 — Email misrouting via quoted local-part containing '@'
 *     Attack: '"attacker@gmail.com x"@internal.domain' is sent to gmail.com
 *     Fix:    Reject any address whose local-part (before the final '@') itself
 *             contains an '@', whether quoted or not.
 */

const nodemailer = require('nodemailer');
const { getDb } = require('../models/db');

const APP_URL = (process.env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');

// ── Email address validation ──────────────────────────────────────────────────
//
// Validates a single email address string and throws a descriptive Error if it
// fails. Applied to every address before it reaches nodemailer's parser.
//
// Rules enforced:
//   1. Must be a non-empty string
//   2. Must not contain ':' or ';'  — blocks CVE-1 (group DoS)
//   3. Must contain exactly one '@' at the top level (outside any quotes)
//   4. The local-part must not itself contain '@' — blocks CVE-2 (misrouting)
//   5. Domain must contain at least one '.' and no whitespace
//   6. Overall length <= 254 characters (RFC 5321)
//
function validateEmailAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    throw new Error('Email address must be a non-empty string');
  }

  const addr = address.trim();

  if (addr.length > 254) {
    throw new Error(`Email address too long (max 254 characters): ${addr}`);
  }

  // CVE-1: block group-syntax characters that trigger infinite recursion in
  // nodemailer's addressparser when nested groups are present.
  if (addr.includes(':') || addr.includes(';')) {
    throw new Error(`Email address contains illegal characters (':' or ';'): ${addr}`);
  }

  // Find the last '@' — the split point between local-part and domain.
  const atIndex = addr.lastIndexOf('@');
  if (atIndex < 1) {
    throw new Error(`Email address missing '@': ${addr}`);
  }

  const localPart = addr.slice(0, atIndex);
  const domain    = addr.slice(atIndex + 1);

  // CVE-2: the local-part must not contain another '@', even inside quotes.
  // RFC 5321 does not permit '@' in a quoted local-part when used as a
  // routable address — and nodemailer's parser misroutes such addresses.
  if (localPart.includes('@')) {
    throw new Error(`Email local-part contains embedded '@' (possible misrouting attack): ${addr}`);
  }

  // Domain must have at least one dot and no whitespace.
  if (!domain.includes('.') || /\s/.test(domain)) {
    throw new Error(`Email address has invalid domain: ${addr}`);
  }

  return addr; // normalised, trimmed address
}

function loadSmtpConfig() {
  try {
    const db  = getDb();
    const row = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
    return row || { mode: 'console' };
  } catch {
    return { mode: 'console' };
  }
}

function buildTransporter(cfg) {
  if (cfg.mode === 'console') return null;

  if (cfg.mode === 'anonymous') {
    if (!process.env.SMTP_HOST) return null;
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  if (cfg.mode === 'custom') {
    if (!cfg.host) return null;
    return nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port || 587,
      secure: Boolean(cfg.secure),
      auth:   cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  return null;
}

function logToConsole({ to, subject, link }) {
  console.log('\n\u{1F4E7} [NEOVISIONVE \u2014 EMAIL NOT SENT: configure SMTP in Admin \u2192 Email]');
  console.log('   To:      ' + to);
  console.log('   Subject: ' + subject);
  if (link) console.log('   Link:    ' + link);
  console.log('');
}

// Minimal HTML escaping for values inserted into email HTML
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInviteEmail({ fromUsername, itemType, itemTitle, token, message }) {
  const link      = APP_URL + '/accept-share?token=' + token;
  const typeLabel = itemType === 'note' ? 'note' : 'bookmark';

  const textParts = [
    fromUsername + ' has shared a ' + typeLabel + ' with you on NeovisionVE.',
    '',
    'Item: "' + itemTitle + '"',
    message ? 'Message: "' + message + '"' : null,
    '',
    'To view this shared item, click the link below.',
    'You will need a free NeovisionVE account (or log in) to accept it.',
    '',
    'Accept: ' + link,
    '',
    'This link expires in 30 days.',
    '',
    '\u2014 NeovisionVE',
  ].filter(l => l !== null).join('\n');

  const html = [
    '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#2A363B;border-radius:12px;overflow:hidden;">',
    '<div style="background:linear-gradient(135deg,#FF847C,#E84A5F);padding:24px 28px;">',
    '<div style="font-size:22px;font-weight:700;color:#fff;">\uD83D\uDD12 NeovisionVE</div>',
    '<div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Encrypted Notes &amp; Bookmarks</div>',
    '</div>',
    '<div style="padding:28px;background:#2A363B;color:#E8DCC8;">',
    '<p style="font-size:16px;margin:0 0 16px;font-weight:600;"><span style="color:#FF847C">' + escHtml(fromUsername) + '</span> shared a ' + typeLabel + ' with you</p>',
    '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;margin-bottom:20px;">',
    '<div style="font-size:13px;color:#99B898;margin-bottom:4px;text-transform:uppercase;">' + typeLabel + '</div>',
    '<div style="font-size:15px;font-weight:600;color:#FECEAB;">' + escHtml(itemTitle || '(untitled)') + '</div>',
    message ? '<div style="font-size:13px;color:#E8DCC8;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);font-style:italic;">&ldquo;' + escHtml(message) + '&rdquo;</div>' : '',
    '</div>',
    '<a href="' + escHtml(link) + '" style="display:block;text-align:center;background:linear-gradient(135deg,#FF847C,#E84A5F);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:16px;">Accept Share &rarr;</a>',
    '<p style="font-size:12px;color:rgba(232,220,200,0.5);text-align:center;margin:0;">You&apos;ll need a free NeovisionVE account to view this.<br/>Link expires in 30 days.</p>',
    '</div></div>',
  ].join('');

  return { text: textParts, html, link, typeLabel };
}

async function sendShareInvite({ toEmail, fromUsername, fromEmail, itemType, itemTitle, token, message }) {
  // Validate before touching nodemailer — blocks both CVEs at our layer
  const safeToEmail = validateEmailAddress(toEmail);

  const cfg         = loadSmtpConfig();
  const transporter = buildTransporter(cfg);
  const { text, html, link, typeLabel } = buildInviteEmail({ fromUsername, itemType, itemTitle, token, message });
  const subject = fromUsername + ' shared a ' + typeLabel + ' with you \u2014 NeovisionVE';

  if (!transporter) {
    logToConsole({ to: safeToEmail, subject, link });
    return { delivered: false, mode: 'console' };
  }

  let from;
  if (cfg.mode === 'custom' && cfg.from_address) {
    from = cfg.from_address;
  } else {
    from = process.env.SMTP_FROM || 'NeovisionVE <no-reply@neovisionve.local>';
  }

  const mailOptions = { from, to: safeToEmail, subject, text, html };
  if (fromEmail) mailOptions.replyTo = fromUsername + ' <' + validateEmailAddress(fromEmail) + '>';

  await transporter.sendMail(mailOptions);
  return { delivered: true, mode: cfg.mode };
}

async function sendTestEmail(toEmail, cfg) {
  // Validate before touching nodemailer — blocks both CVEs at our layer
  const safeToEmail = validateEmailAddress(toEmail);

  const transporter = buildTransporter(cfg);
  if (!transporter) throw new Error('No SMTP transporter available for this configuration');

  await transporter.sendMail({
    from:    cfg.from_address || process.env.SMTP_FROM || 'NeovisionVE <no-reply@neovisionve.local>',
    to:      safeToEmail,
    subject: 'NeovisionVE \u2014 SMTP test email',
    text:    'This is a test email from your NeovisionVE instance.\n\nIf you received this, your SMTP configuration is working correctly.',
    html:    '<div style="font-family:system-ui,sans-serif;padding:24px;background:#2A363B;color:#E8DCC8;border-radius:10px;max-width:480px;"><div style="font-size:18px;font-weight:700;color:#FF847C;margin-bottom:12px;">\uD83D\uDD12 NeovisionVE SMTP Test</div><p style="margin:0;font-size:14px;line-height:1.6;">This is a test email from your NeovisionVE instance.<br/><br/>If you received this, your SMTP configuration is working correctly. \u2713</p></div>',
  });
}

function getSmtpStatus() {
  const cfg = loadSmtpConfig();
  return {
    mode:                      cfg.mode        || 'console',
    host:                      cfg.host        || null,
    port:                      cfg.port        || 587,
    secure:                    Boolean(cfg.secure),
    user:                      cfg.user        || null,
    from_address:              cfg.from_address || null,
    has_password:              Boolean(cfg.pass),
    updated_at:                cfg.updated_at  || null,
    anonymous_relay_available: Boolean(process.env.SMTP_HOST),
  };
}

module.exports = { sendShareInvite, sendTestEmail, getSmtpStatus, validateEmailAddress };
