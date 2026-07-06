'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');
const { renderTemplate } = require('../services/email');

const router = express.Router();
router.use(requireAuth);

const FIELDS = ['name', 'type_id', 'bg_image', 'title', 'body_html',
  'bg_color', 'text_color', 'accent_color', 'signature', 'active'];

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM EmailTemplates ORDER BY id').all());
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM EmailTemplates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'לא נמצא' });
  res.json(t);
});

router.post('/', requireRole('editor'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'שם התבנית חובה' });
  const vals = FIELDS.map((f) => (f === 'active' ? (b.active === 0 ? 0 : 1) : (b[f] ?? null)));
  const info = db.prepare(
    `INSERT INTO EmailTemplates (${FIELDS.join(',')}) VALUES (${FIELDS.map(() => '?').join(',')})`
  ).run(...vals);
  logAction(req.user.userId, 'create', 'template', `תבנית מייל: ${b.name}`);
  res.status(201).json(db.prepare('SELECT * FROM EmailTemplates WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('editor'), (req, res) => {
  const ex = db.prepare('SELECT * FROM EmailTemplates WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  const updates = FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = FIELDS.map((f) => (b[f] !== undefined ? (f === 'active' ? (b[f] ? 1 : 0) : b[f]) : ex[f]));
  db.prepare(`UPDATE EmailTemplates SET ${updates} WHERE id = ?`).run(...vals, req.params.id);
  logAction(req.user.userId, 'update', 'template', `עדכון תבנית #${req.params.id}`);
  res.json(db.prepare('SELECT * FROM EmailTemplates WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM EmailTemplates WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'template', `מחיקת תבנית #${req.params.id}`);
  res.json({ ok: true });
});

// תצוגה מקדימה: מקבל שדות תבנית + נתוני דמו ומחזיר HTML
router.post('/preview', (req, res) => {
  const t = req.body || {};
  const ctx = {
    name: t.sample_name || 'יוסי כהן',
    title: t.title || 'אירוע',
    age: t.sample_age || 40,
    date: t.sample_date || '2026-04-10',
    hebrew_date: t.sample_hebrew || '',
    photo: t.sample_photo || null,
  };
  res.json({ html: renderTemplate(t, ctx) });
});

module.exports = router;
