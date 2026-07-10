'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { createSession, destroySession, requireAuth, getSession } = require('../auth');
const { logAction } = require('../services/activityLog');
const { sendSystemEmail } = require('../services/email');

const router = express.Router();

function escapeHtmlSafe(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
// כתובת הבסיס של האתר (לבניית קישורים במיילים)
function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

// שכחתי סיסמה — שולח מייל עם קישור איפוס חד-פעמי (תקף לשעה).
// הנתונים כמובן נשארים; רק הסיסמה משתנה.
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body || {};
  const user = db.prepare('SELECT * FROM Users WHERE username = ?').get(username);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // שעה
    db.prepare('UPDATE Users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(token, expires, user.id);

    const link = `${baseUrl(req)}/#/reset?token=${token}`;
    const to = user.email || user.username;
    logAction(user.id, 'update', 'auth', `בקשת איפוס סיסמה: ${username}`);
    await sendSystemEmail({
      to,
      subject: 'איפוס סיסמה — יומן אירועים משפחתי',
      title: '🔑 איפוס סיסמה',
      bodyHtml: `<p>שלום ${escapeHtmlSafe(user.full_name || user.username)},</p>`
        + '<p>קיבלנו בקשה לאיפוס הסיסמה שלך. לחצו על הכפתור כדי לבחור סיסמה חדשה.</p>'
        + '<p style="color:#888;font-size:14px">הקישור תקף לשעה אחת. אם לא ביקשתם זאת — התעלמו מהמייל, שום דבר לא ישתנה.</p>',
      buttonText: 'בחירת סיסמה חדשה',
      buttonUrl: link,
      userId: user.id,
    });
  }

  // תשובה זהה תמיד, כדי לא לחשוף אילו משתמשים קיימים
  res.json({ ok: true, message: 'אם המשתמש קיים, נשלח אליו מייל עם קישור לאיפוס הסיסמה.' });
});

// איפוס בפועל — לפי האסימון מהמייל
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'חסר אסימון או סיסמה' });
  if (String(password).length < 4) return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 4 תווים' });

  const user = db.prepare('SELECT * FROM Users WHERE reset_token = ?').get(token);
  if (!user) return res.status(400).json({ error: 'הקישור אינו תקף' });
  if (!user.reset_expires || new Date(user.reset_expires) < new Date()) {
    return res.status(400).json({ error: 'הקישור פג תוקף. בקשו קישור חדש.' });
  }

  db.prepare('UPDATE Users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?')
    .run(bcrypt.hashSync(String(password), 10), user.id);
  logAction(user.id, 'update', 'auth', 'סיסמה אופסה דרך קישור במייל');
  res.json({ ok: true, message: 'הסיסמה עודכנה! אפשר להתחבר.' });
});

module.exports = router;
