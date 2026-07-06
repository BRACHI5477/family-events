'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

// נתיב האחסון — ניתן להגדרה דרך DATA_DIR (לדיסק קבוע בענן), אחרת ./data מקומי
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'family.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema — לפי סעיף 20 באפיון
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'admin',          -- admin | editor | viewer
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  data_url TEXT,                                -- base64 data URL (שמירה פשוטה)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS FamilyMembers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  nickname TEXT,
  image_id INTEGER REFERENCES Images(id),
  hebrew_birth TEXT,                            -- טקסט תאריך עברי
  gregorian_birth TEXT,                         -- YYYY-MM-DD
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  relation TEXT,                               -- קשר משפחתי
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS FamilyRelations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES FamilyMembers(id) ON DELETE CASCADE,
  related_member_id INTEGER NOT NULL REFERENCES FamilyMembers(id) ON DELETE CASCADE,
  relation_type TEXT
);

CREATE TABLE IF NOT EXISTS EventTypes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT,                                    -- אימוג'י
  color TEXT DEFAULT '#4f8cff',
  default_template_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES FamilyMembers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type_id INTEGER REFERENCES EventTypes(id),
  hebrew_date TEXT,
  gregorian_date TEXT,                          -- YYYY-MM-DD (תאריך מקור/בסיס)
  color TEXT,
  image_id INTEGER REFERENCES Images(id),
  notes TEXT,
  calc_mode TEXT NOT NULL DEFAULT 'gregorian',  -- hebrew | gregorian | both
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS EmailTemplates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type_id INTEGER REFERENCES EventTypes(id),
  bg_image TEXT,
  title TEXT,
  body_html TEXT,
  bg_color TEXT DEFAULT '#ffffff',
  text_color TEXT DEFAULT '#222222',
  accent_color TEXT DEFAULT '#4f8cff',
  signature TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ReminderRules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES Events(id) ON DELETE CASCADE,
  offset_type TEXT NOT NULL,                    -- month|two_weeks|week|three_days|day_before|same_day|day_after|custom
  custom_days INTEGER,
  send_time TEXT DEFAULT '08:00',
  recipients TEXT,                              -- רשימת מיילים מופרדת בפסיקים
  template_id INTEGER REFERENCES EmailTemplates(id),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER REFERENCES ReminderRules(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES Events(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,                  -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | sent | failed
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS EmailQueue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id INTEGER REFERENCES Reminders(id) ON DELETE CASCADE,
  to_addr TEXT,
  subject TEXT,
  html TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS EmailLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT,
  subject TEXT,
  status TEXT,                                  -- sent | failed | preview
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ActivityLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,                                  -- login|create|update|delete|email|error
  entity TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------------------------------------------------------------------------
// Seed — נתוני דמו ראשוניים (רק אם ריק)
// ---------------------------------------------------------------------------
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) c FROM Users').get().c;
  if (userCount === 0) {
    // סיסמת האדמין הראשוני — ניתנת להגדרה דרך ADMIN_PASSWORD (חשוב בענן!)
    const adminPass = process.env.ADMIN_PASSWORD || '1234';
    db.prepare(
      'INSERT INTO Users (username, password_hash, full_name, email, role) VALUES (?,?,?,?,?)'
    ).run('admin', bcrypt.hashSync(adminPass, 10), 'מנהל המערכת', 'admin@example.com', 'admin');
  }

  // הגדרות ברירת מחדל
  const defaults = {
    system_name: 'יומן אירועים משפחתי',
    logo: '👨‍👩‍👧‍👦',
    primary_color: '#4f8cff',
    accent_color: '#ff7a59',
    default_date_display: 'combined',           // hebrew | gregorian | combined
    timezone: 'Asia/Jerusalem',
    ui_language: 'he',
    sender_name: 'יומן אירועים משפחתי',
    sender_email: '',
    signature: 'בברכה,\nמערכת יומן האירועים המשפחתי',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    active_modules: JSON.stringify([
      'dashboard', 'members', 'events', 'reminders', 'templates',
      'reports', 'users', 'settings', 'activity'
    ]),
  };
  const upsert = db.prepare('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) upsert.run(k, String(v));

  const typeCount = db.prepare('SELECT COUNT(*) c FROM EventTypes').get().c;
  if (typeCount === 0) {
    const insType = db.prepare(
      'INSERT INTO EventTypes (name, icon, color, active) VALUES (?,?,?,1)'
    );
    const bday = insType.run('יום הולדת', '🎂', '#ff7a59').lastInsertRowid;
    const anniv = insType.run('יום נישואין', '💍', '#c86fe0').lastInsertRowid;
    const custom = insType.run('אירוע משפחתי', '🎉', '#4f8cff').lastInsertRowid;

    // תבנית מייל לכל סוג
    const insTpl = db.prepare(`INSERT INTO EmailTemplates
      (name, type_id, title, body_html, accent_color, signature, active)
      VALUES (?,?,?,?,?,?,1)`);
    const sig = 'בברכה,\nהמשפחה 💛';
    const tBday = insTpl.run('תבנית יום הולדת', bday, 'מזל טוב ליום ההולדת! 🎂',
      '<p>{{name}} חוגג/ת היום יום הולדת {{age}}!</p><p>שנה טובה ומאושרת 🎉</p>', '#ff7a59', sig).lastInsertRowid;
    const tAnniv = insTpl.run('תבנית יום נישואין', anniv, 'מזל טוב ליום הנישואין! 💍',
      '<p>{{name}} חוגגים היום {{age}} שנות נישואין!</p><p>אהבה ואושר תמיד 💕</p>', '#c86fe0', sig).lastInsertRowid;
    const tCustom = insTpl.run('תבנית אירוע', custom, 'תזכורת לאירוע 🎉',
      '<p>מזכירים על האירוע: {{title}}</p><p>בתאריך {{date}}</p>', '#4f8cff', sig).lastInsertRowid;

    db.prepare('UPDATE EventTypes SET default_template_id=? WHERE id=?').run(tBday, bday);
    db.prepare('UPDATE EventTypes SET default_template_id=? WHERE id=?').run(tAnniv, anniv);
    db.prepare('UPDATE EventTypes SET default_template_id=? WHERE id=?').run(tCustom, custom);

    // בני משפחה לדוגמה + אירועים
    const insMember = db.prepare(`INSERT INTO FamilyMembers
      (first_name, last_name, nickname, gregorian_birth, phone, email, relation)
      VALUES (?,?,?,?,?,?,?)`);
    const yossi = insMember.run('יוסי', 'כהן', 'יוסי', '1985-04-10', '050-1234567', 'yossi@example.com', 'אבא').lastInsertRowid;
    const dana = insMember.run('דנה', 'כהן', 'דני', '1988-09-15', '052-7654321', 'dana@example.com', 'אמא').lastInsertRowid;
    const noa = insMember.run('נועה', 'כהן', 'נועי', '2016-07-20', '', '', 'בת').lastInsertRowid;

    const insEvent = db.prepare(`INSERT INTO Events
      (member_id, title, type_id, gregorian_date, color, calc_mode)
      VALUES (?,?,?,?,?,?)`);
    insEvent.run(yossi, 'יום הולדת – יוסי', bday, '1985-04-10', '#ff7a59', 'gregorian');
    insEvent.run(dana, 'יום הולדת – דנה', bday, '1988-09-15', '#ff7a59', 'gregorian');
    insEvent.run(noa, 'יום הולדת – נועה', bday, '2016-07-20', '#ff7a59', 'both');
    insEvent.run(yossi, 'יום נישואין', anniv, '2012-06-25', '#c86fe0', 'gregorian');
  }
}

seed();

module.exports = db;
