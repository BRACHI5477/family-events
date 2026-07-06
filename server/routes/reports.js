'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { occurrencesInRange } = require('./dashboard');
const { fmtGreg, stripTime } = require('../services/hebrewDates');

const router = express.Router();
router.use(requireAuth);

// דוח סיכום כללי
router.get('/summary', (req, res) => {
  const fam = req.familyId;
  const membersTotal = db.prepare('SELECT COUNT(*) c FROM FamilyMembers WHERE archived = 0 AND family_id = ?').get(fam).c;
  const membersArchived = db.prepare('SELECT COUNT(*) c FROM FamilyMembers WHERE archived = 1 AND family_id = ?').get(fam).c;
  const eventsTotal = db.prepare('SELECT COUNT(*) c FROM Events WHERE active = 1 AND family_id = ?').get(fam).c;

  const byType = db.prepare(`
    SELECT et.name, et.icon, et.color, COUNT(e.id) c
    FROM EventTypes et LEFT JOIN Events e ON e.type_id = et.id AND e.active = 1 AND e.family_id = ?
    GROUP BY et.id ORDER BY c DESC`).all(fam);

  const reminders = {
    pending: db.prepare("SELECT COUNT(*) c FROM Reminders WHERE status='pending'").get().c,
    sent: db.prepare("SELECT COUNT(*) c FROM Reminders WHERE status='sent'").get().c,
    failed: db.prepare("SELECT COUNT(*) c FROM Reminders WHERE status='failed'").get().c,
  };

  const emails = {
    sent: db.prepare("SELECT COUNT(*) c FROM EmailLog WHERE status='sent'").get().c,
    preview: db.prepare("SELECT COUNT(*) c FROM EmailLog WHERE status='preview'").get().c,
    failed: db.prepare("SELECT COUNT(*) c FROM EmailLog WHERE status='failed'").get().c,
  };

  // אירועים ב-30 הימים הקרובים
  const today = stripTime(new Date());
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const upcoming = occurrencesInRange(fmtGreg(today), fmtGreg(in30), fam);

  res.json({ membersTotal, membersArchived, eventsTotal, byType, reminders, emails, upcoming });
});

// דוח אירועים לפי חודש (התפלגות שנתית לועזית)
router.get('/by-month', (req, res) => {
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const list = occurrencesInRange(`${year}-01-01`, `${year}-12-31`, req.familyId);
  const months = Array.from({ length: 12 }, () => 0);
  for (const o of list) months[new Date(o.date + 'T12:00:00').getMonth()]++;
  res.json({ year, months });
});

module.exports = router;
