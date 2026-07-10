'use strict';

// העלאת תמונות — נשמרות כ-data URL בטבלת Images.
// מתאים לתמונות קטנות (לוגו, תמונת אירוע/בן משפחה) ושורד את סנכרון מסד הנתונים לענן.

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

const MAX_BYTES = 700 * 1024;              // ~700KB לתמונה
const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

// העלאת תמונה — מקבלת data URL מהדפדפן
router.post('/', requireRole('editor'), (req, res) => {
  const { data_url, filename } = req.body || {};
  if (!data_url || typeof data_url !== 'string') {
    return res.status(400).json({ error: 'לא התקבלה תמונה' });
  }
  const m = data_url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'פורמט תמונה לא תקין' });

  const mime = m[1];
  if (!ALLOWED.includes(mime)) {
    return res.status(400).json({ error: 'סוג קובץ לא נתמך. השתמשו ב-PNG, JPG, GIF או WEBP.' });
  }
  const bytes = Buffer.byteLength(m[2], 'base64');
  if (bytes > MAX_BYTES) {
    return res.status(400).json({ error: `התמונה גדולה מדי (${Math.round(bytes / 1024)}KB). המקסימום ${Math.round(MAX_BYTES / 1024)}KB.` });
  }

  const info = db.prepare('INSERT INTO Images (filename, data_url) VALUES (?,?)').run(filename || null, data_url);
  logAction(req.user.userId, 'create', 'image', `העלאת תמונה (${Math.round(bytes / 1024)}KB)`);
  res.status(201).json({ id: info.lastInsertRowid, data_url });
});

// שליפת תמונה לפי מזהה
router.get('/:id', (req, res) => {
  const img = db.prepare('SELECT id, data_url FROM Images WHERE id = ?').get(req.params.id);
  if (!img) return res.status(404).json({ error: 'לא נמצא' });
  res.json(img);
});

router.delete('/:id', requireRole('editor'), (req, res) => {
  db.prepare('DELETE FROM Images WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
