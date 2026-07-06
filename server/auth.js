'use strict';

// אימות session פשוט מבוסס טוקן בזיכרון + cookie (דמו).
const crypto = require('crypto');
const db = require('./db');

const sessions = new Map(); // token -> { userId, username, role, family_id, currentFamily }

function firstFamilyId() {
  const f = db.prepare('SELECT id FROM Families ORDER BY id LIMIT 1').get();
  return f ? f.id : null;
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  // למנהלת-על: הקשר משפחה ברירת מחדל = המשפחה הראשונה (ניתן להחלפה)
  const currentFamily = user.role === 'superadmin' ? firstFamilyId() : user.family_id;
  sessions.set(token, {
    userId: user.id, username: user.username, role: user.role,
    family_id: user.family_id, currentFamily,
  });
  return token;
}

function destroySession(token) { sessions.delete(token); }
function getSession(token) { return token ? sessions.get(token) : null; }

// Middleware: דורש התחברות. מגדיר req.user ו-req.familyId (המשפחה הפעילה)
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.sid;
  const sess = getSession(token);
  if (!sess) return res.status(401).json({ error: 'לא מחובר' });
  req.user = sess;
  req.isSuper = sess.role === 'superadmin';
  // המשפחה הפעילה: מנהלת-על לפי ההקשר שבחרה, אחרת המשפחה הקבועה של המשתמש
  req.familyId = req.isSuper ? sess.currentFamily : sess.family_id;
  next();
}

// דירוג הרשאות: superadmin > admin > editor > viewer
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, superadmin: 4 };
function requireRole(minRole) {
  return (req, res, next) => {
    const rank = ROLE_RANK[req.user?.role] || 0;
    if (rank < (ROLE_RANK[minRole] || 0)) {
      return res.status(403).json({ error: 'אין הרשאה מספקת לפעולה זו' });
    }
    next();
  };
}

function requireSuper(req, res, next) {
  if (!req.isSuper) return res.status(403).json({ error: 'נדרשת הרשאת מנהלת-על' });
  next();
}

module.exports = {
  createSession, destroySession, getSession, requireAuth, requireRole, requireSuper, sessions, db,
};
