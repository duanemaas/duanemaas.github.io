const crypto = require('crypto');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const sessions = new Map();
const failures = new Map();

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = (stored || '').split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { user, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

function isLockedOut(ip) {
  const entry = failures.get(ip);
  return Boolean(entry && entry.count >= MAX_FAILURES && Date.now() < entry.until);
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  const count = entry && Date.now() < entry.until ? entry.count + 1 : 1;
  failures.set(ip, { count, until: Date.now() + LOCKOUT_MS });
}

function clearFailures(ip) {
  failures.delete(ip);
}

module.exports = {
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  destroySession,
  isLockedOut,
  recordFailure,
  clearFailures,
};
