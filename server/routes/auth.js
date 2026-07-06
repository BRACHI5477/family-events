'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { createSession, destroySession, requireAuth } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();

// התחברות
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM Users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    logAction(user ? user.id : null, 'error', 'auth', `כניסה נכשלה: ${username}`);
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }
  const token = createSession(user);
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure, maxAge: 1000 * 60 * 60 * 24 * 30 });
  logAction(user.id, 'login', 'auth', `כניסה: ${username}`);
  res.json({ user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});

// מי מחובר
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, full_name, email, role FROM Users WHERE id = ?').get(req.user.userId);
  res.json({ user });
});

// יציאה
router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.sid;
  if (token) destroySession(token);
  res.clearCookie('sid');
  res.json({ ok: true });
});

// החלפת סיסמה
router.post('/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.user.userId);
  if (!bcrypt.compareSync(String(current || ''), user.password_hash)) {
    return res.status(400).json({ error: 'הסיסמה הנוכחית שגויה' });
  }
  if (!next || String(next).length < 4) {
    return res.status(400).json({ error: 'סיסמה חדשה חייבת להכיל לפחות 4 תווים' });
  }
  db.prepare('UPDATE Users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(next), 10), user.id);
  logAction(user.id, 'update', 'auth', 'החלפת סיסמה');
  res.json({ ok: true });
});

// שכחתי סיסמה (דמו — מאפס ל-1234)
router.post('/forgot-password', (req, res) => {
  const { username } = req.body || {};
  const user = db.prepare('SELECT * FROM Users WHERE username = ?').get(username);
  if (user) {
    db.prepare('UPDATE Users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync('1234', 10), user.id);
    logAction(user.id, 'update', 'auth', 'איפוס סיסמה (שכחתי סיסמה)');
  }
  // תמיד תשובה זהה כדי לא לחשוף קיום משתמש
  res.json({ ok: true, message: 'אם המשתמש קיים, הסיסמה אופסה ל-1234 (מצב דמו)' });
});

module.exports = router;
