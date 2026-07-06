'use strict';

// אימות session פשוט מבוסס טוקן בזיכרון + cookie (דמו).
const crypto = require('crypto');
const db = require('./db');

const sessions = new Map(); // token -> { userId, username, role }

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: user.id, username: user.username, role: user.role });
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function getSession(token) {
  return token ? sessions.get(token) : null;
}

// Middleware: דורש התחברות
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.sid;
  const sess = getSession(token);
  if (!sess) return res.status(401).json({ error: 'לא מחובר' });
  req.user = sess;
  next();
}

// Middleware: דורש תפקיד מסוים או גבוה יותר (admin > editor > viewer)
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
function requireRole(minRole) {
  return (req, res, next) => {
    const rank = ROLE_RANK[req.user?.role] || 0;
    if (rank < (ROLE_RANK[minRole] || 0)) {
      return res.status(403).json({ error: 'אין הרשאה מספקת לפעולה זו' });
    }
    next();
  };
}

module.exports = { createSession, destroySession, getSession, requireAuth, requireRole, sessions, db };
