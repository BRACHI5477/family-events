'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { enrich } = require('./events');
const {
  nextGregorianAnniversary, nextHebrewAnniversary, fmtGreg, stripTime, gregorianToHebrewText, HEB_MONTHS,
} = require('../services/hebrewDates');
const { ageForEvent } = require('../services/age');
const { HDate, gematriya } = require('@hebcal/core');

const router = express.Router();
router.use(requireAuth);

// שם חודש עברי מדויק (כולל טיפול באדר בשנה מעוברת)
function hebMonthName(m, year) {
  if (m === 12) return HDate.isLeapYear(year) ? 'אדר א׳' : 'אדר';
  if (m === 13) return 'אדר ב׳';
  return HEB_MONTHS[m] || '';
}

// כל מופעי האירועים בטווח תאריכים (לצורך לוח השנה), מסונן לפי משפחה
function occurrencesInRange(fromStr, toStr, familyId) {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T23:59:59');
  const events = familyId
    ? db.prepare('SELECT * FROM Events WHERE active = 1 AND family_id = ?').all(familyId)
    : db.prepare('SELECT * FROM Events WHERE active = 1').all();
  const out = [];

  for (const ev of events) {
    if (!ev.gregorian_date) continue;
    const member = ev.member_id ? db.prepare('SELECT * FROM FamilyMembers WHERE id = ?').get(ev.member_id) : null;
    const type = ev.type_id ? db.prepare('SELECT * FROM EventTypes WHERE id = ?').get(ev.type_id) : null;
    const dates = new Set();

    if (ev.recurring === 0) {
      // אירוע חד-פעמי — מופיע רק בתאריכו הקבוע
      const base = new Date(ev.gregorian_date + 'T12:00:00');
      if (base >= from && base <= to) dates.add(ev.gregorian_date);
    } else {
      // אירוע חוזר — מופע בכל שנה בטווח
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
        location: ev.location || '',
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
  res.json(occurrencesInRange(from, to, req.familyId));
});

// מבנה חודש עברי — ימים לפי הלוח העברי + התאמה ללועזי + אירועים
router.get('/hebrew-month', (req, res) => {
  let hyear = parseInt(req.query.hyear, 10);
  let hmonth = parseInt(req.query.hmonth, 10);
  if (!hyear || !hmonth) {
    const t = new HDate(new Date());
    hyear = t.getFullYear();
    hmonth = t.getMonth();
  }
  const daysCount = HDate.daysInMonth(hmonth, hyear);
  const first = new HDate(1, hmonth, hyear);
  const firstGreg = fmtGreg(first.greg());
  const lastGreg = fmtGreg(new HDate(daysCount, hmonth, hyear).greg());

  // אירועים בטווח הלועזי המקביל, ממופים לפי תאריך
  const occ = occurrencesInRange(firstGreg, lastGreg, req.familyId);
  const map = {};
  for (const o of occ) (map[o.date] = map[o.date] || []).push(o);

  const days = [];
  for (let d = 1; d <= daysCount; d++) {
    const hd = new HDate(d, hmonth, hyear);
    const greg = fmtGreg(hd.greg());
    days.push({ hday: d, label: gematriya(d), greg, events: map[greg] || [] });
  }

  const prev = new HDate(first.abs() - 1);
  const next = new HDate(first.abs() + daysCount);
  res.json({
    hyear, hmonth,
    monthName: hebMonthName(hmonth, hyear),
    yearLabel: gematriya(hyear),
    days,
    prev: { hyear: prev.getFullYear(), hmonth: prev.getMonth(), name: hebMonthName(prev.getMonth(), prev.getFullYear()) },
    next: { hyear: next.getFullYear(), hmonth: next.getMonth(), name: hebMonthName(next.getMonth(), next.getFullYear()) },
  });
});

// אירועי היום / השבוע / החודש
router.get('/summary', (req, res) => {
  const today = stripTime(new Date());
  const todayStr = fmtGreg(today);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const monthEnd = new Date(today); monthEnd.setDate(monthEnd.getDate() + 31);

  const week = occurrencesInRange(todayStr, fmtGreg(weekEnd), req.familyId);
  const month = occurrencesInRange(todayStr, fmtGreg(monthEnd), req.familyId);
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
