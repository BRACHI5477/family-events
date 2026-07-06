'use strict';

const cron = require('node-cron');
const db = require('../db');
const { logAction } = require('./activityLog');
const { sendEventEmail } = require('./email');
const {
  nextGregorianAnniversary, nextHebrewAnniversary, fmtGreg, stripTime,
} = require('./hebrewDates');

const OFFSET_DAYS = {
  month: 30,
  two_weeks: 14,
  week: 7,
  three_days: 3,
  day_before: 1,
  same_day: 0,
  day_after: -1,
};

function offsetDays(rule) {
  if (rule.offset_type === 'custom') return parseInt(rule.custom_days || '0', 10);
  return OFFSET_DAYS[rule.offset_type] ?? 0;
}

// מחשב את המופע הקרוב של האירוע לפי מצב החישוב
function nextOccurrence(event, fromDate = new Date()) {
  if (event.recurring === 0) return new Date(event.gregorian_date + 'T12:00:00'); // חד-פעמי
  if (event.calc_mode === 'hebrew') return nextHebrewAnniversary(event.gregorian_date, fromDate);
  return nextGregorianAnniversary(event.gregorian_date, fromDate);
}

// תאריך שליחת התזכורת הקרובה עבור כלל
function reminderDateFor(event, rule, fromDate = new Date()) {
  const occ = nextOccurrence(event, fromDate);
  const d = new Date(occ);
  d.setDate(d.getDate() - offsetDays(rule));
  return stripTime(d);
}

// יוצר/מרענן רשומות Reminders עתידיות עבור כל כלל פעיל (idempotent)
function generateReminders() {
  const rules = db.prepare('SELECT * FROM ReminderRules WHERE active = 1').all();
  let created = 0;
  for (const rule of rules) {
    const event = db.prepare('SELECT * FROM Events WHERE id = ? AND active = 1').get(rule.event_id);
    if (!event || !event.gregorian_date) continue;

    // מחשב את תאריך התזכורת הקרוב; אם כבר עבר, מחשב עבור המופע הבא
    let schedDate = reminderDateFor(event, rule);
    const today = stripTime(new Date());
    if (schedDate < today) {
      if (event.recurring === 0) continue; // אירוע חד-פעמי שעבר — אין תזכורת עתידית
      const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
      schedDate = reminderDateFor(event, rule, nextYear);
    }
    const schedStr = fmtGreg(schedDate);

    const exists = db.prepare(
      "SELECT id FROM Reminders WHERE rule_id = ? AND scheduled_for = ? AND status != 'sent'"
    ).get(rule.id, schedStr);
    if (!exists) {
      db.prepare('INSERT INTO Reminders (rule_id, event_id, scheduled_for, status) VALUES (?,?,?,?)')
        .run(rule.id, rule.event_id, schedStr, 'pending');
      created++;
    }
  }
  return created;
}

// שולח תזכורות שהגיע זמנן (scheduled_for <= today, status pending)
async function processDueReminders() {
  const today = fmtGreg(stripTime(new Date()));
  const due = db.prepare("SELECT * FROM Reminders WHERE status = 'pending' AND scheduled_for <= ?").all(today);
  let sent = 0;
  for (const r of due) {
    const event = db.prepare('SELECT * FROM Events WHERE id = ?').get(r.event_id);
    const rule = db.prepare('SELECT * FROM ReminderRules WHERE id = ?').get(r.rule_id);
    if (!event || !rule) {
      db.prepare("UPDATE Reminders SET status = 'failed' WHERE id = ?").run(r.id);
      continue;
    }
    const result = await sendEventEmail({
      event,
      occurrenceDate: fmtGreg(nextOccurrence(event)),
      templateId: rule.template_id,
      recipients: rule.recipients,
      userId: null,
    });
    const status = result.status === 'failed' ? 'failed' : 'sent';
    db.prepare("UPDATE Reminders SET status = ?, sent_at = datetime('now') WHERE id = ?").run(status, r.id);
    if (status === 'sent') sent++;
  }
  return sent;
}

let started = false;
function start() {
  if (started) return;
  started = true;
  // ריצה יומית ב-06:00 (שרת) — מייצר תזכורות ושולח את אלו שהגיע זמנן
  cron.schedule('0 6 * * *', async () => {
    try {
      generateReminders();
      const sent = await processDueReminders();
      logAction(null, 'email', 'scheduler', `ריצת תזכורות יומית: נשלחו ${sent}`);
    } catch (e) {
      logAction(null, 'error', 'scheduler', e.message);
    }
  });
  // ריצה ראשונית בעת עליית השרת (יצירת תזכורות בלבד, ללא שליחה אוטומטית)
  try { generateReminders(); } catch (e) { /* ignore */ }
}

module.exports = { start, generateReminders, processDueReminders, reminderDateFor, nextOccurrence, offsetDays, OFFSET_DAYS };
