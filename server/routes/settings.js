'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

// מפתחות רגישים שלא נחזיר כטקסט גלוי (סיסמת SMTP) — נחזיר רק סימון שקיים
const SENSITIVE = ['smtp_pass'];

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM Settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

router.get('/', (req, res) => {
  const s = getAllSettings();
  const out = { ...s };
  for (const k of SENSITIVE) if (out[k]) out[k] = '********';
  res.json(out);
});

router.put('/', requireRole('admin'), (req, res) => {
  const body = req.body || {};
  const upsert = db.prepare(
    'INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE.includes(k) && (v === '********' || v === '')) continue; // אל תדרוס סיסמה בכוכביות
    upsert.run(k, v == null ? '' : String(v));
  }
  logAction(req.user.userId, 'update', 'settings', `עדכון הגדרות: ${Object.keys(body).join(', ')}`);
  const out = getAllSettings();
  for (const k of SENSITIVE) if (out[k]) out[k] = '********';
  res.json(out);
});

// בדיקת חיבור SMTP — מאמת מול השרת ומחזיר שגיאה ברורה
router.post('/test-smtp', requireRole('admin'), async (req, res) => {
  const { buildTransport } = require('../services/email');
  const transport = buildTransport();
  if (!transport) {
    return res.json({ ok: false, error: 'SMTP לא מוגדר — חסר שרת או שם משתמש' });
  }
  try {
    await transport.verify();
    res.json({ ok: true, message: 'החיבור ל-SMTP תקין! ✅' });
  } catch (err) {
    let hint = '';
    if (/timeout/i.test(err.message)) hint = ' — נסו פורט 2525 (או 465 עם הצפנה SSL). ייתכן שהפורט חסום.';
    else if (/auth|credential|535/i.test(err.message)) hint = ' — שם המשתמש או מפתח ה-SMTP שגויים.';
    res.json({ ok: false, error: err.message + hint });
  }
});

// העדפות משתמש (מסך בית וכו') — נשמרות תחת מפתח ייחודי למשתמש
router.get('/prefs', (req, res) => {
  const row = db.prepare('SELECT value FROM Settings WHERE key = ?').get('prefs_user_' + req.user.userId);
  res.json(row ? JSON.parse(row.value) : {});
});

router.put('/prefs', (req, res) => {
  db.prepare(
    'INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('prefs_user_' + req.user.userId, JSON.stringify(req.body || {}));
  res.json({ ok: true });
});

module.exports = { router, getAllSettings };
