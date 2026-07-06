'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

const ROLES = ['admin', 'editor', 'viewer'];

// רשימת משתמשים (מנהל בלבד)
router.get('/', requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT id, username, full_name, email, role, created_at FROM Users ORDER BY id').all());
});

router.post('/', requireRole('admin'), (req, res) => {
  const { username, password, full_name, email, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה חובה' });
  if (db.prepare('SELECT id FROM Users WHERE username = ?').get(username)) {
    return res.status(400).json({ error: 'שם המשתמש כבר קיים' });
  }
  const r = ROLES.includes(role) ? role : 'viewer';
  const info = db.prepare(
    'INSERT INTO Users (username, password_hash, full_name, email, role) VALUES (?,?,?,?,?)'
  ).run(username, bcrypt.hashSync(String(password), 10), full_name || null, email || null, r);
  logAction(req.user.userId, 'create', 'user', `הוספת משתמש: ${username} (${r})`);
  res.status(201).json(db.prepare('SELECT id, username, full_name, email, role FROM Users WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const ex = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  const role = ROLES.includes(b.role) ? b.role : ex.role;
  // מניעת הורדת ההרשאה של המנהל האחרון
  if (ex.role === 'admin' && role !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) c FROM Users WHERE role = 'admin'").get().c;
    if (admins <= 1) return res.status(400).json({ error: 'לא ניתן להסיר את המנהל האחרון' });
  }
  db.prepare('UPDATE Users SET full_name=?, email=?, role=? WHERE id=?')
    .run(b.full_name ?? ex.full_name, b.email ?? ex.email, role, req.params.id);
  if (b.password) {
    db.prepare('UPDATE Users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(b.password), 10), req.params.id);
  }
  logAction(req.user.userId, 'update', 'user', `עדכון משתמש #${req.params.id}`);
  res.json(db.prepare('SELECT id, username, full_name, email, role FROM Users WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.userId) return res.status(400).json({ error: 'לא ניתן למחוק את המשתמש שלך' });
  const ex = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.params.id);
  if (ex && ex.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) c FROM Users WHERE role = 'admin'").get().c;
    if (admins <= 1) return res.status(400).json({ error: 'לא ניתן למחוק את המנהל האחרון' });
  }
  db.prepare('DELETE FROM Users WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'user', `מחיקת משתמש #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
