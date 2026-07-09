'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');
const {
  gregorianToHebrewText, nextGregorianAnniversary, nextHebrewAnniversary, fmtGreg, hebrewPartsToGreg,
  hebrewParts,
} = require('../services/hebrewDates');

// אם הוזנו חלקי תאריך עברי — המר ללועזי וקבע מצב חישוב עברי
function applyHebrewInput(b) {
  if (b.hebrew_day && b.hebrew_month && b.hebrew_year) {
    try {
      b.gregorian_date = hebrewPartsToGreg(b.hebrew_day, b.hebrew_month, b.hebrew_year);
      b.calc_mode = 'hebrew';
    } catch (e) { /* תאריך עברי לא תקין — מתעלמים */ }
  }
}
const { ageForEvent } = require('../services/age');
const { sendLocationEmail } = require('../services/email');

const router = express.Router();
router.use(requireAuth);

const FIELDS = ['member_id', 'title', 'type_id', 'hebrew_date', 'gregorian_date',
  'color', 'image_id', 'notes', 'location', 'calc_mode', 'recurring', 'active'];

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
    // חלקי התאריך העברי — כדי שטופס העריכה יטען את התאריך האמיתי ולא ברירת מחדל
    hebrew_parts: base ? hebrewParts(base) : null,
    next_gregorian: nextGreg,
    next_hebrew: nextHeb,
    age,
    reminder_sent: reminderCount > 0,
    reminder_pending: pendingCount,
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM Events WHERE active = 1 AND family_id = ? ORDER BY gregorian_date').all(req.familyId);
  res.json(rows.map((r) => enrich(r)));
});

router.get('/:id', (req, res) => {
  const ev = db.prepare('SELECT * FROM Events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!ev) return res.status(404).json({ error: 'לא נמצא' });
  res.json(enrich(ev));
});

router.post('/', requireRole('editor'), (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'כותרת האירוע חובה' });
  applyHebrewInput(b);
  if (!b.calc_mode) b.calc_mode = 'gregorian';
  if (b.gregorian_date) b.hebrew_date = gregorianToHebrewText(b.gregorian_date);
  const vals = FIELDS.map((f) => {
    if (f === 'active') return b.active === 0 ? 0 : 1;
    if (f === 'recurring') return (b.recurring === 0 || b.recurring === false || b.recurring === '0') ? 0 : 1;
    return b[f] ?? null;
  });
  const info = db.prepare(
    `INSERT INTO Events (${FIELDS.join(',')}, family_id) VALUES (${FIELDS.map(() => '?').join(',')}, ?)`
  ).run(...vals, req.familyId);
  logAction(req.user.userId, 'create', 'event', `הוספת אירוע: ${b.title}`);

  // תזכורת מייל אוטומטית — נוצרת אלא אם בוטלה במפורש
  if (b.auto_reminder !== false && b.auto_reminder !== '0' && b.auto_reminder !== 0) {
    const offset = b.reminder_offset || 'week';
    const sendTime = b.reminder_time || '08:00';
    db.prepare('INSERT INTO ReminderRules (event_id, offset_type, send_time, recipients, template_id, active) VALUES (?,?,?,?,?,1)')
      .run(info.lastInsertRowid, offset, sendTime, b.reminder_recipients || null, b.reminder_template_id || null);
    try { require('../services/scheduler').generateReminders(); } catch (e) { /* ignore */ }
    logAction(req.user.userId, 'create', 'reminderRule', `תזכורת אוטומטית לאירוע: ${b.title}`);
  }

  res.status(201).json(enrich(db.prepare('SELECT * FROM Events WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', requireRole('editor'), (req, res) => {
  const ex = db.prepare('SELECT * FROM Events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  applyHebrewInput(b);
  if (b.gregorian_date && b.gregorian_date !== ex.gregorian_date) {
    b.hebrew_date = gregorianToHebrewText(b.gregorian_date);
  }
  const updates = FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = FIELDS.map((f) => {
    if (f === 'recurring') {
      const v = b.recurring !== undefined ? b.recurring : ex.recurring;
      return (v === 0 || v === false || v === '0') ? 0 : 1;
    }
    return b[f] !== undefined ? b[f] : ex[f];
  });
  db.prepare(`UPDATE Events SET ${updates} WHERE id = ?`).run(...vals, req.params.id);
  logAction(req.user.userId, 'update', 'event', `עדכון אירוע #${req.params.id}`);
  res.json(enrich(db.prepare('SELECT * FROM Events WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM Events WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  logAction(req.user.userId, 'delete', 'event', `מחיקת אירוע #${req.params.id}`);
  res.json({ ok: true });
});

// שליחת עדכון מיקום לבני משפחה — פעולה נפרדת מהתזכורות
router.post('/:id/send-location', requireRole('editor'), async (req, res) => {
  const ev = db.prepare('SELECT * FROM Events WHERE id = ? AND family_id = ?').get(req.params.id, req.familyId);
  if (!ev) return res.status(404).json({ error: 'אירוע לא נמצא' });
  const { recipients, note, occurrenceDate } = req.body || {};
  const result = await sendLocationEmail({
    event: ev,
    occurrenceDate: occurrenceDate || ev.gregorian_date,
    recipients,
    note,
    userId: req.user.userId,
  });
  res.json(result);
});

module.exports = { router, enrich };
