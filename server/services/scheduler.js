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

    // אם כבר קיימת תזכורת לאותו כלל ולאותו תאריך — לא יוצרים שוב.
    // (רק תזכורת שנכשלה תיווצר מחדש, כדי לאפשר ניסיון חוזר)
    const exists = db.prepare(
      "SELECT id FROM Reminders WHERE rule_id = ? AND scheduled_for = ? AND status != 'failed'"
    ).get(rule.id, schedStr);
    if (!exists) {
      db.prepare('INSERT INTO Reminders (rule_id, event_id, scheduled_for, status) VALUES (?,?,?,?)')
        .run(rule.id, rule.event_id, schedStr, 'pending');
      created++;
    }
  }
  return created;
}

// האם הגיעה שעת השליחה? (ביום התזכורת עצמו — רק אחרי send_time; ימים שעברו — תמיד)
function timeHasCome(reminder, rule, now = new Date()) {
  const today = fmtGreg(stripTime(now));
  if (reminder.scheduled_for < today) return true;         // תזכורת שאיחרה — לשלוח מיד
  if (reminder.scheduled_for > today) return false;         // עוד לא הגיע היום
  const [h, m] = String(rule.send_time || '08:00').split(':').map(Number);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return minutesNow >= ((h || 0) * 60 + (m || 0));
}

// שולח תזכורות שהגיע זמנן (התאריך הגיע וגם שעת השליחה עברה)
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
    if (!timeHasCome(r, rule)) continue;                    // עוד לא הגיעה שעת השליחה
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

// ריצה מלאה: מייצר תזכורות עתידיות ושולח את אלו שהגיע זמנן
let running = false;
async function runNow(source = 'cron') {
  if (running) return { skipped: true };                    // מונע ריצות חופפות
  running = true;
  try {
    const created = generateReminders();
    const sent = await processDueReminders();
    if (sent > 0 || created > 0) {
      logAction(null, 'email', 'scheduler', `ריצת תזכורות (${source}): נוצרו ${created}, נשלחו ${sent}`);
    }
    return { created, sent };
  } catch (e) {
    logAction(null, 'error', 'scheduler', `שגיאת תזכורות: ${e.message}`);
    return { error: e.message };
  } finally {
    running = false;
  }
}

// הרצה "אופורטוניסטית" — בכל בקשה לאתר, לכל היותר פעם ב-10 דקות.
// כך תזכורות נשלחות גם כשהשרת החינמי נרדם ומתעורר רק בביקור.
let lastOpportunistic = 0;
function opportunisticRun() {
  const now = Date.now();
  if (now - lastOpportunistic < 10 * 60 * 1000) return;
  lastOpportunistic = now;
  runNow('ביקור באתר').catch(() => {});
}

// ניקוי כפילויות שנוצרו בעבר: תזכורת ממתינה שכבר נשלחה לאותו כלל ותאריך
function cleanupDuplicateReminders() {
  const r = db.prepare(`DELETE FROM Reminders WHERE status = 'pending' AND EXISTS (
    SELECT 1 FROM Reminders r2 WHERE r2.rule_id = Reminders.rule_id
      AND r2.scheduled_for = Reminders.scheduled_for AND r2.status = 'sent')`).run();
  if (r.changes > 0) logAction(null, 'update', 'scheduler', `נוקו ${r.changes} תזכורות כפולות`);
  return r.changes;
}

let started = false;
function start() {
  if (started) return;
  started = true;
  // כל 15 דקות — כדי לכבד את שעת השליחה שהוגדרה בכל תזכורת
  cron.schedule('*/15 * * * *', () => { runNow('תזמון'); });
  // ריצה ראשונית בעת עליית השרת (ניקוי + יצירת תזכורות בלבד, ללא שליחה)
  try { cleanupDuplicateReminders(); generateReminders(); } catch (e) { /* ignore */ }
}

module.exports = {
  cleanupDuplicateReminders,
  start, runNow, opportunisticRun, generateReminders, processDueReminders,
  reminderDateFor, nextOccurrence, offsetDays, OFFSET_DAYS, timeHasCome,
};
