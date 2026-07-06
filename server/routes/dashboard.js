'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { enrich } = require('./events');
const {
  nextGregorianAnniversary, nextHebrewAnniversary, fmtGreg, stripTime, gregorianToHebrewText,
} = require('../services/hebrewDates');
const { ageForEvent } = require('../services/age');

const router = express.Router();
router.use(requireAuth);

// כל מופעי האירועים בטווח תאריכים (לצורך לוח השנה)
function occurrencesInRange(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T23:59:59');
  const events = db.prepare('SELECT * FROM Events WHERE active = 1').all();
  const out = [];

  for (const ev of events) {
    if (!ev.gregorian_date) continue;
    const member = ev.member_id ? db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(ev.member_id) : null;
    const type = ev.type_id ? db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(ev.type_id) : null;
    const dates = new Set();

    // מעבר על כל שנה בטווח כדי לתפוס מופעים
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      const jan1 = new Date(y, 0, 1);
      if (ev.calc_mode === 'gregorian' || ev.calc_mode === 'both') {
        const g = nextGregorianAnniversary(ev.gregorian_date, jan1);
        if (g >= from && g <= to) dates.add(fmtGreg(g));
      }
      if (ev.calc_mode === 'hebrew' || ev.calc_mode === 'both') {
        const h = nextHebrewAnniversary(ev.gregorian_date, jan1);
        if (h >= from && h <= to) dates.add(fmtGreg(h));
      }
    }

    for (const dateStr of dates) {
      const occDate = new Date(dateStr + 'T12:00:00');
      const age = member ? ageForEvent(ev, member, occDate) : { label: '' };
      out.push({
        event_id: ev.id,
        date: dateStr,
        title: ev.title,
        member_name: member ? `${member.first_name} ${member.last_name || ''}`.trim() : '',
        type_name: type ? type.name : '',
        icon: type ? type.icon : '📅',
        color: ev.color || (type ? type.color : '#4f8cff'),
        calc_mode: ev.calc_mode,
        hebrew_date_text: gregorianToHebrewText(dateStr),
        age_label: age.label,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

router.get('/occurrences', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'נדרשים פרמטרים from ו-to' });
  res.json(occurrencesInRange(from, to));
});

// אירועי היום / השבוע / החודש
router.get('/summary', (req, res) => {
  const today = stripTime(new Date());
  const todayStr = fmtGreg(today);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const monthEnd = new Date(today); monthEnd.setDate(monthEnd.getDate() + 31);

  const week = occurrencesInRange(todayStr, fmtGreg(weekEnd));
  const month = occurrencesInRange(todayStr, fmtGreg(monthEnd));
  const todayEvents = week.filter((o) => o.date === todayStr);

  res.json({
    today: todayStr,
    today_hebrew: gregorianToHebrewText(todayStr),
    todayEvents,
    week,
    month,
  });
});

module.exports = { router, occurrencesInRange };
