'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

// תפקידים שמותר להעניק: מנהלת-על יכולה הכול; מנהל משפחה — עורך/צפייה בלבד
function allowedRoles(req) {
  return req.isSuper ? ['superadmin', 'admin', 'editor', 'viewer'] : ['admin', 'editor', 'viewer'];
}

// רשימת משתמשים — מנהלת-על רואה הכול (עם שם משפחה); מנהל רואה רק את משפחתו
router.get('/', requireRole('admin'), (req, res) => {
  const rows = req.isSuper
    ? db.prepare(`SELECT u.id, u.username, u.full_name, u.email, u.role, u.family_id, u.created_at, f.name AS family_name
        FROM Users u LEFT JOIN Families f ON f.id = u.family_id ORDER BY u.id`).all()
    : db.prepare(`SELECT u.id, u.username, u.full_name, u.email, u.role, u.family_id, u.created_at, f.name AS family_name
        FROM Users u LEFT JOIN Families f ON f.id = u.family_id WHERE u.family_id = ? ORDER BY u.id`).all(req.familyId);
  res.json(rows);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { username, password, full_name, email, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה חובה' });
  if (db.prepare('SELECT id FROM Users WHERE username = ?').get(username)) {
    return res.status(400).json({ error: 'שם המשתמש כבר קיים' });
  }
  const allowed = allowedRoles(req);
  const r = allowed.includes(role) ? role : 'viewer';
  // שיוך משפחה: מנהלת-על בוחרת (ברירת מחדל = המשפחה הפעילה); מנהל = משפחתו בלבד
  let familyId = req.familyId;
  if (req.isSuper && req.body.family_id) familyId = req.body.family_id;
  if (r === 'superadmin') familyId = null;
  const info = db.prepare(
    'INSERT INTO Users (username, password_hash, full_name, email, role, family_id) VALUES (?,?,?,?,?,?)'
  ).run(username, bcrypt.hashSync(String(password), 10), full_name || null, email || null, r, familyId);
  logAction(req.user.userId, 'create', 'user', `הוספת משתמש: ${username} (${r})`);
  res.status(201).json(db.prepare('SELECT id, username, full_name, email, role, family_id FROM Users WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const ex = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  // מנהל משפחה יכול לערוך רק משתמשים במשפחתו ולא מנהלת-על
  if (!req.isSuper && (ex.family_id !== req.familyId || ex.role === 'superadmin')) {
    return res.status(403).json({ error: 'אין הרשאה לערוך משתמש זה' });
  }
  const b = req.body || {};
  const allowed = allowedRoles(req);
  const role = allowed.includes(b.role) ? b.role : ex.role;
  // מניעת הורדת מנהלת-העל האחרונה
  if (ex.role === 'superadmin' && role !== 'superadmin') {
    const supers = db.prepare("SELECT COUNT(*) c FROM Users WHERE role = 'superadmin'").get().c;
    if (supers <= 1) return res.status(400).json({ error: 'לא ניתן להסיר את מנהלת-העל האחרונה' });
  }
  let familyId = ex.family_id;
  if (req.isSuper && b.family_id !== undefined) familyId = b.family_id;
  if (role === 'superadmin') familyId = null;
  db.prepare('UPDATE Users SET full_name=?, email=?, role=?, family_id=? WHERE id=?')
    .run(b.full_name ?? ex.full_name, b.email ?? ex.email, role, familyId, req.params.id);
  if (b.password) {
    db.prepare('UPDATE Users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(b.password), 10), req.params.id);
  }
  logAction(req.user.userId, 'update', 'user', `עדכון משתמש #${req.params.id}`);
  res.json(db.prepare('SELECT id, username, full_name, email, role, family_id FROM Users WHERE id = ?').get(req.params.id));
});

// אישור בקשת גישה — הופך משתמש ממתין לצופה (ברירת מחדל) או לתפקיד אחר
router.post('/:id/approve', requireRole('admin'), (req, res) => {
  const ex = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  if (!req.isSuper && ex.family_id !== req.familyId) {
    return res.status(403).json({ error: 'אין הרשאה לאשר משתמש זה' });
  }
  const allowed = allowedRoles(req).filter((r) => r !== 'superadmin');
  const role = allowed.includes(req.body && req.body.role) ? req.body.role : 'viewer';
  let familyId = ex.family_id;
  if (req.isSuper && req.body && req.body.family_id) familyId = req.body.family_id;
  db.prepare('UPDATE Users SET role = ?, family_id = ? WHERE id = ?').run(role, familyId, req.params.id);
  logAction(req.user.userId, 'update', 'user', `אישור גישה למשתמש #${req.params.id} (${role})`);
  res.json({ ok: true, role });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.userId) return res.status(400).json({ error: 'לא ניתן למחוק את המשתמש שלך' });
  const ex = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  if (!req.isSuper && (ex.family_id !== req.familyId || ex.role === 'superadmin')) {
    return res.status(403).json({ error: 'אין הרשאה למחוק משתמש זה' });
  }
  if (ex.role === 'superadmin') {
    const supers = db.prepare("SELECT COUNT(*) c FROM Users WHERE role = 'superadmin'").get().c;
    if (supers <= 1) return res.status(400).json({ error: 'לא ניתן למחוק את מנהלת-העל האחרונה' });
  }
  db.prepare('DELETE FROM Users WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'user', `מחיקת משתמש #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
