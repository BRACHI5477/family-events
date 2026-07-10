'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');
const { sendSystemEmail } = require('../services/email');

const router = express.Router();
router.use(requireAuth);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function baseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

const ROLE_HE = { superadmin: 'מנהל/ת-על', admin: 'מנהל/ת', editor: 'עורך/ת', viewer: 'צפייה בלבד' };

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

// שליחת קישור התחברות למשתמש (הזמנה). אפשר לצרף סיסמה זמנית חדשה.
router.post('/:id/send-invite', requireRole('admin'), async (req, res) => {
  const u = db.prepare('SELECT * FROM Users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'לא נמצא' });
  if (!req.isSuper && u.family_id !== req.familyId) {
    return res.status(403).json({ error: 'אין הרשאה למשתמש זה' });
  }
  const to = u.email || u.username;
  if (!to || !to.includes('@')) {
    return res.status(400).json({ error: 'למשתמש אין כתובת דוא"ל. ערכו אותו והוסיפו מייל.' });
  }

  // סיסמה זמנית (אופציונלי) — אם נשלחה, מוגדרת עכשיו
  const tempPassword = req.body && req.body.temp_password;
  if (tempPassword) {
    db.prepare('UPDATE Users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(tempPassword), 10), u.id);
  }

  const link = baseUrl(req);
  const family = u.family_id ? db.prepare('SELECT name FROM Families WHERE id = ?').get(u.family_id) : null;
  const inviter = db.prepare('SELECT full_name, username FROM Users WHERE id = ?').get(req.user.userId);

  const result = await sendSystemEmail({
    to,
    subject: 'הוזמנת ליומן האירועים המשפחתי 🎉',
    title: '🎉 הוזמנת ליומן האירועים המשפחתי',
    bodyHtml: `<p>שלום ${esc(u.full_name || u.username)},</p>`
      + `<p><b>${esc(inviter.full_name || inviter.username)}</b> הזמין/ה אותך ליומן האירועים המשפחתי`
      + `${family ? ` של <b>${esc(family.name)}</b>` : ''}.</p>`
      + '<p style="background:#f6f8fc;padding:14px;border-radius:10px;line-height:2">'
      + `<b>שם משתמש:</b> ${esc(u.username)}<br>`
      + (tempPassword ? `<b>סיסמה:</b> ${esc(tempPassword)}<br>` : '')
      + `<b>הרשאה:</b> ${ROLE_HE[u.role] || u.role}</p>`
      + (tempPassword ? '<p style="color:#888;font-size:14px">מומלץ להחליף סיסמה אחרי הכניסה הראשונה (הגדרות → החלפת סיסמה).</p>' : '<p style="color:#888;font-size:14px">אם שכחת את הסיסמה — לחצ/י "שכחתי סיסמה" במסך הכניסה.</p>'),
    buttonText: 'כניסה ליומן',
    buttonUrl: link,
    userId: req.user.userId,
  });

  logAction(req.user.userId, 'email', 'user', `נשלחה הזמנה ל-${to}`);
  res.json({ ...result, to });
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
