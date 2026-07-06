'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');
const { gregorianToHebrewText } = require('../services/hebrewDates');
const { currentGregorianAge } = require('../services/age');

const router = express.Router();
router.use(requireAuth);

const FIELDS = ['first_name', 'last_name', 'nickname', 'image_id', 'hebrew_birth',
  'gregorian_birth', 'phone', 'email', 'address', 'notes', 'relation'];

function enrich(m) {
  if (!m) return m;
  return {
    ...m,
    hebrew_birth_calc: m.gregorian_birth ? gregorianToHebrewText(m.gregorian_birth) : '',
    current_age: currentGregorianAge(m.gregorian_birth),
  };
}

// רשימה (מסוננת לפי המשפחה הפעילה, כולל ארכיון אופציונלי)
router.get('/', (req, res) => {
  const includeArchived = req.query.archived === '1';
  const rows = db.prepare(
    `SELECT * FROM FamilyMembers WHERE family_id = ? ${includeArchived ? '' : 'AND archived = 0'} ORDER BY first_name`
  ).all(req.familyId);
  res.json(rows.map(enrich));
});

router.get('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM FamilyMembers WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!m) return res.status(404).json({ error: 'לא נמצא' });
  res.json(enrich(m));
});

// יצירה
router.post('/', requireRole('editor'), (req, res) => {
  const b = req.body || {};
  if (!b.first_name) return res.status(400).json({ error: 'שם פרטי הוא שדה חובה' });
  // אם לא סופק תאריך עברי — חשב מהלועזי
  if (!b.hebrew_birth && b.gregorian_birth) b.hebrew_birth = gregorianToHebrewText(b.gregorian_birth);
  const vals = FIELDS.map((f) => b[f] ?? null);
  const info = db.prepare(
    `INSERT INTO FamilyMembers (${FIELDS.join(',')}, family_id) VALUES (${FIELDS.map(() => '?').join(',')}, ?)`
  ).run(...vals, req.familyId);
  logAction(req.user.userId, 'create', 'member', `הוספת בן משפחה: ${b.first_name} ${b.last_name || ''}`);
  res.status(201).json(enrich(db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(info.lastInsertRowid)));
});

// עדכון
router.put('/:id', requireRole('editor'), (req, res) => {
  const existing = db.prepare('SELECT * FROM FamilyMembers WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!existing) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  if (b.gregorian_birth && b.gregorian_birth !== existing.gregorian_birth && !b.hebrew_birth) {
    b.hebrew_birth = gregorianToHebrewText(b.gregorian_birth);
  }
  const updates = FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = FIELDS.map((f) => (b[f] !== undefined ? b[f] : existing[f]));
  db.prepare(`UPDATE FamilyMembers SET ${updates} WHERE id = ?`).run(...vals, req.params.id);
  logAction(req.user.userId, 'update', 'member', `עדכון בן משפחה #${req.params.id}`);
  res.json(enrich(db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(req.params.id)));
});

// ארכוב / שחזור
router.post('/:id/archive', requireRole('editor'), (req, res) => {
  const val = req.body && req.body.archived === false ? 0 : 1;
  db.prepare('UPDATE FamilyMembers SET archived = ? WHERE id = ? AND family_id = ?').run(val, req.params.id, req.familyId);
  logAction(req.user.userId, 'update', 'member', `${val ? 'ארכוב' : 'שחזור'} בן משפחה #${req.params.id}`);
  res.json({ ok: true, archived: !!val });
});

// מחיקה
router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM FamilyMembers WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  logAction(req.user.userId, 'delete', 'member', `מחיקת בן משפחה #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
