'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');
const { sendEventEmail } = require('../services/email');
const { generateReminders, reminderDateFor, nextOccurrence } = require('../services/scheduler');
const { fmtGreg } = require('../services/hebrewDates');

const router = express.Router();
router.use(requireAuth);

// חוקי תזכורת של אירוע (מסונן למשפחה הפעילה דרך שיוך האירוע)
router.get('/rules', (req, res) => {
  const eventId = req.query.event_id;
  let sql = `SELECT rr.* FROM ReminderRules rr JOIN Events e ON e.id = rr.event_id WHERE e.family_id = ?`;
  const params = [req.familyId];
  if (eventId) { sql += ' AND rr.event_id = ?'; params.push(eventId); }
  sql += ' ORDER BY rr.id';
  res.json(db.prepare(sql).all(...params));
});

router.post('/rules', requireRole('editor'), (req, res) => {
  const b = req.body || {};
  if (!b.event_id || !b.offset_type) return res.status(400).json({ error: 'event_id ו-offset_type חובה' });
  const owns = db.prepare('SELECT id FROM Events WHERE id = ? AND family_id = ?').get(b.event_id, req.familyId);
  if (!owns) return res.status(403).json({ error: 'האירוע אינו שייך למשפחה הפעילה' });
  const info = db.prepare(
    'INSERT INTO ReminderRules (event_id, offset_type, custom_days, send_time, recipients, template_id, active) VALUES (?,?,?,?,?,?,?)'
  ).run(b.event_id, b.offset_type, b.custom_days || null, b.send_time || '08:00',
    b.recipients || null, b.template_id || null, b.active === 0 ? 0 : 1);
  generateReminders();
  logAction(req.user.userId, 'create', 'reminderRule', `כלל תזכורת לאירוע #${b.event_id}`);
  res.status(201).json(db.prepare('SELECT * FROM ReminderRules WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/rules/:id', requireRole('editor'), (req, res) => {
  const ex = db.prepare('SELECT rr.* FROM ReminderRules rr JOIN Events e ON e.id = rr.event_id WHERE rr.id = ? AND e.family_id = ?').get(req.params.id, req.familyId);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  db.prepare(`UPDATE ReminderRules SET offset_type=?, custom_days=?, send_time=?, recipients=?, template_id=?, active=? WHERE id=?`)
    .run(b.offset_type ?? ex.offset_type, b.custom_days ?? ex.custom_days, b.send_time ?? ex.send_time,
      b.recipients ?? ex.recipients, b.template_id ?? ex.template_id,
      b.active !== undefined ? (b.active ? 1 : 0) : ex.active, req.params.id);
  generateReminders();
  logAction(req.user.userId, 'update', 'reminderRule', `עדכון כלל תזכורת #${req.params.id}`);
  res.json(db.prepare('SELECT * FROM ReminderRules WHERE id = ?').get(req.params.id));
});

router.delete('/rules/:id', requireRole('editor'), (req, res) => {
  const ex = db.prepare('SELECT rr.id FROM ReminderRules rr JOIN Events e ON e.id = rr.event_id WHERE rr.id = ? AND e.family_id = ?').get(req.params.id, req.familyId);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('DELETE FROM ReminderRules WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'reminderRule', `מחיקת כלל תזכורת #${req.params.id}`);
  res.json({ ok: true });
});

// תזכורות מתוכננות (מועשרות בפרטי אירוע)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, e.title AS event_title, rr.offset_type
    FROM Reminders r
    JOIN Events e ON e.id = r.event_id
    LEFT JOIN ReminderRules rr ON rr.id = r.rule_id
    WHERE e.family_id = ?
    ORDER BY r.scheduled_for ASC, r.id DESC`).all(req.familyId);
  res.json(rows);
});

// יצירה/רענון של כל התזכורות
router.post('/generate', requireRole('editor'), (req, res) => {
  const created = generateReminders();
  logAction(req.user.userId, 'update', 'reminders', `רענון תזכורות: נוצרו ${created}`);
  res.json({ ok: true, created });
});

// שליחה מיידית (בדיקה) של מייל לאירוע
router.post('/send-now', requireRole('editor'), async (req, res) => {
  const { event_id, template_id, recipients } = req.body || {};
  const event = db.prepare('SELECT * FROM Events WHERE id = ? AND family_id = ?').get(event_id, req.familyId);
  if (!event) return res.status(404).json({ error: 'אירוע לא נמצא' });
  const result = await sendEventEmail({
    event,
    occurrenceDate: event.gregorian_date ? fmtGreg(nextOccurrence(event)) : null,
    templateId: template_id,
    recipients,
    userId: req.user.userId,
  });
  res.json(result);
});

module.exports = router;
