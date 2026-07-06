'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM EventTypes ORDER BY id').all());
});

router.post('/', requireRole('editor'), (req, res) => {
  const { name, icon, color, default_template_id, active } = req.body || {};
  if (!name) return res.status(400).json({ error: 'שם סוג האירוע חובה' });
  const info = db.prepare(
    'INSERT INTO EventTypes (name, icon, color, default_template_id, active) VALUES (?,?,?,?,?)'
  ).run(name, icon || '📅', color || '#4f8cff', default_template_id || null, active === 0 ? 0 : 1);
  logAction(req.user.userId, 'create', 'eventType', `סוג אירוע: ${name}`);
  res.status(201).json(db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('editor'), (req, res) => {
  const ex = db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  db.prepare('UPDATE EventTypes SET name=?, icon=?, color=?, default_template_id=?, active=? WHERE id=?').run(
    b.name ?? ex.name, b.icon ?? ex.icon, b.color ?? ex.color,
    b.default_template_id ?? ex.default_template_id,
    b.active !== undefined ? (b.active ? 1 : 0) : ex.active, req.params.id
  );
  logAction(req.user.userId, 'update', 'eventType', `עדכון סוג אירוע #${req.params.id}`);
  res.json(db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM EventTypes WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'eventType', `מחיקת סוג אירוע #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
