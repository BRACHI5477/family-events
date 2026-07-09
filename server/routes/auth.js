'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { createSession, destroySession, requireAuth, getSession } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();

// מידע משתמש מלא + הקשר משפחה
function userInfo(req) {
  const u = db.prepare('SELECT id, username, full_name, email, role, family_id FROM Users WHERE id = ?').get(req.user.userId);
  const families = req.isSuper
    ? db.prepare('SELECT id, name FROM Families WHERE active = 1 ORDER BY name').all()
    : (u.family_id ? db.prepare('SELECT id, name FROM Families WHERE id = ?').all(u.family_id) : []);
  return {
    user: u,
    is_super: req.isSuper,
    current_family: req.familyId,
    families,
  };
}

// התחברות
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM Users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    logAction(user ? user.id : null, 'error', 'auth', `כניסה נכשלה: ${username}`);
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }
  if (user.role === 'pending') {
    return res.status(403).json({ error: 'בקשת הגישה שלך ממתינה לאישור המנהל' });
  }
  const token = createSession(user);
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure, maxAge: 1000 * 60 * 60 * 24 * 30 });
  logAction(user.id, 'login', 'auth', `כניסה: ${username}`);
  res.json({ user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});

// מי מחובר (כולל הקשר משפחה ורשימת משפחות)
router.get('/me', requireAuth, (req, res) => {
  res.json(userInfo(req));
});

// החלפת המשפחה הפעילה (מנהלת-על בלבד)
router.post('/family-context', requireAuth, (req, res) => {
  if (!req.isSuper) return res.status(403).json({ error: 'נדרשת הרשאת מנהלת-על' });
  const { family_id } = req.body || {};
  const fam = db.prepare('SELECT id FROM Families WHERE id = ?').get(family_id);
  if (!fam) return res.status(400).json({ error: 'משפחה לא קיימת' });
  const token = req.cookies.sid;
  const sess = getSession(token);
  sess.currentFamily = fam.id;
  res.json({ ok: true, current_family: fam.id });
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

// בקשת גישה כצופה — בן משפחה מבקש גישה, ממתין לאישור המנהל
router.post('/request-access', (req, res) => {
  const { full_name, username, password } = req.body || {};
  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'יש למלא שם מלא, שם משתמש וסיסמה' });
  }
  if (db.prepare('SELECT id FROM Users WHERE username = ?').get(username)) {
    return res.status(400).json({ error: 'שם המשתמש כבר קיים' });
  }
  // שיוך למשפחה הראשונה; המנהל יכול לשנות באישור
  const fam = db.prepare('SELECT id FROM Families ORDER BY id LIMIT 1').get();
  db.prepare('INSERT INTO Users (username, password_hash, full_name, email, role, family_id) VALUES (?,?,?,?,?,?)')
    .run(username, bcrypt.hashSync(String(password), 10), full_name, username, 'pending', fam ? fam.id : null);
  logAction(null, 'create', 'access-request', `בקשת גישה חדשה: ${full_name} (${username})`);
  res.json({ ok: true, message: 'הבקשה נשלחה! תוכל להיכנס לאחר שהמנהל יאשר אותה.' });
});

// שכחתי סיסמה (דמו — מאפס ל-1234)
// שכחתי סיסמה — אינו מאפס סיסמה! רק מתעד בקשה ומפנה למנהל.
// (איפוס עצמי ללא אימות זהות הוא פרצת אבטחה)
router.post('/forgot-password', (req, res) => {
  const { username } = req.body || {};
  const user = db.prepare('SELECT id FROM Users WHERE username = ?').get(username);
  if (user) logAction(user.id, 'update', 'auth', `בקשת איפוס סיסמה: ${username}`);
  // תשובה זהה תמיד, כדי לא לחשוף אילו משתמשים קיימים
  res.json({
    ok: true,
    message: 'הבקשה נרשמה. לאיפוס סיסמה יש לפנות למנהל/ת המערכת, שיאפס/תאפס עבורך במסך המשתמשים.',
  });
});

module.exports = router;
