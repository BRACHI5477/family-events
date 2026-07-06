'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

// טבלאות לגיבוי, בסדר תלות (הורים לפני ילדים)
const TABLES = [
  'Users', 'Images', 'FamilyMembers', 'FamilyRelations', 'EventTypes',
  'EmailTemplates', 'Events', 'ReminderRules', 'Reminders', 'EmailQueue',
  'EmailLog', 'Settings', 'ActivityLog',
];

// ייצוא — הורדת קובץ JSON עם כל הנתונים
router.get('/export', requireRole('admin'), (req, res) => {
  const dump = { version: 1, exported_at: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    dump.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  logAction(req.user.userId, 'update', 'backup', 'ייצוא גיבוי מלא');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="family-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(dump, null, 2));
});

// שחזור — מחליף את כל הנתונים בקובץ שהועלה
router.post('/import', requireRole('admin'), (req, res) => {
  const dump = req.body;
  if (!dump || !dump.tables) return res.status(400).json({ error: 'קובץ גיבוי לא תקין' });

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    // מחיקה בסדר הפוך
    for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
    // הכנסה בסדר תלות
    let count = 0;
    for (const t of TABLES) {
      const rows = dump.tables[t];
      if (!Array.isArray(rows) || !rows.length) continue;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      );
      for (const row of rows) { stmt.run(...cols.map((c) => row[c])); count++; }
    }
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
    logAction(req.user.userId, 'update', 'backup', `שחזור גיבוי: ${count} רשומות`);
    res.json({ ok: true, restored: count });
  } catch (err) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON');
    logAction(req.user.userId, 'error', 'backup', `כשל שחזור: ${err.message}`);
    res.status(500).json({ error: 'שחזור נכשל: ' + err.message });
  }
});

module.exports = router;
