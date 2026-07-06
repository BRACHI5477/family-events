'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');
const {
  gregorianToHebrewText, nextGregorianAnniversary, nextHebrewAnniversary, fmtGreg,
} = require('../services/hebrewDates');
const { ageForEvent } = require('../services/age');

const router = express.Router();
router.use(requireAuth);

const FIELDS = ['member_id', 'title', 'type_id', 'hebrew_date', 'gregorian_date',
  'color', 'image_id', 'notes', 'calc_mode', 'active'];

// העשרת אירוע: מידע על בעל האירוע, תאריך עברי, המופע הבא, גיל, סטטוס תזכורת
function enrich(ev, fromDate = new Date()) {
  if (!ev) return ev;
  const member = ev.member_id ? db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(ev.member_id) : null;
  const type = ev.type_id ? db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(ev.type_id) : null;
  const base = ev.gregorian_date;
  const nextGreg = base ? fmtGreg(nextGregorianAnniversary(base, fromDate)) : null;
  const nextHeb = base ? fmtGreg(nextHebrewAnniversary(base, fromDate)) : null;
  const age = member ? ageForEvent(ev, member, fromDate) : { greg: null, hebrew: null, label: '' };
  const reminderCount = db.prepare(
    "SELECT COUNT(*) c FROM Reminders WHERE event_id = ? AND status = 'sent'"
  ).get(ev.id).c;
  const pendingCount = db.prepare(
    "SELECT COUNT(*) c FROM Reminders WHERE event_id = ? AND status = 'pending'"
  ).get(ev.id).c;
  return {
    ...ev,
    member_name: member ? `${member.first_name} ${member.last_name || ''}`.trim() : '',
    member,
    type_name: type ? type.name : '',
    type_icon: type ? type.icon : '📅',
    type_color: type ? type.color : null,
    display_color: ev.color || (type ? type.color : '#4f8cff'),
    hebrew_date_text: base ? gregorianToHebrewText(base) : (ev.hebrew_date || ''),
    next_gregorian: nextGreg,
    next_hebrew: nextHeb,
    age,
    reminder_sent: reminderCount > 0,
    reminder_pending: pendingCount,
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM Events WHERE active = 1 ORDER BY gregorian_date').all();
  res.json(rows.map((r) => enrich(r)));
});

router.get('/:id', (req, res) => {
  const ev = db.prepare('SELECT * FROM Events WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'לא נמצא' });
  res.json(enrich(ev));
});

router.post('/', requireRole('editor'), (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'כותרת האירוע חובה' });
  if (!b.calc_mode) b.calc_mode = 'gregorian';
  if (!b.hebrew_date && b.gregorian_date) b.hebrew_date = gregorianToHebrewText(b.gregorian_date);
  const vals = FIELDS.map((f) => (f === 'active' ? (b.active === 0 ? 0 : 1) : (b[f] ?? null)));
  const info = db.prepare(
    `INSERT INTO Events (${FIELDS.join(',')}) VALUES (${FIELDS.map(() => '?').join(',')})`
  ).run(...vals);
  logAction(req.user.userId, 'create', 'event', `הוספת אירוע: ${b.title}`);
  res.status(201).json(enrich(db.prepare('SELECT * FROM Events WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', requireRole('editor'), (req, res) => {
  const ex = db.prepare('SELECT * FROM Events WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  if (b.gregorian_date && b.gregorian_date !== ex.gregorian_date && !b.hebrew_date) {
    b.hebrew_date = gregorianToHebrewText(b.gregorian_date);
  }
  const updates = FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = FIELDS.map((f) => (b[f] !== undefined ? b[f] : ex[f]));
  db.prepare(`UPDATE Events SET ${updates} WHERE id = ?`).run(...vals, req.params.id);
  logAction(req.user.userId, 'update', 'event', `עדכון אירוע #${req.params.id}`);
  res.json(enrich(db.prepare('SELECT * FROM Events WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM Events WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'event', `מחיקת אירוע #${req.params.id}`);
  res.json({ ok: true });
});

module.exports = { router, enrich };
