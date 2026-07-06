'use strict';

// חישוב גיל אוטומטי (סעיף 10) — כמה שנים מלאו/ימלאו במופע הקרוב.
const { toHDate, nextGregorianAnniversary, nextHebrewAnniversary, stripTime } = require('./hebrewDates');

// גיל לפי הלוח הלועזי במופע הקרוב הבא של התאריך
function gregorianAgeAtNext(birthStr, fromDate = new Date()) {
  if (!birthStr) return null;
  const birth = new Date(birthStr + 'T12:00:00');
  const next = nextGregorianAnniversary(birthStr, fromDate);
  return next.getFullYear() - birth.getFullYear();
}

// גיל לפי הלוח העברי במופע הקרוב הבא
function hebrewAgeAtNext(birthStr, fromDate = new Date()) {
  if (!birthStr) return null;
  const birthHd = toHDate(birthStr);
  const next = nextHebrewAnniversary(birthStr, fromDate);
  const nextHd = toHDate(require('./hebrewDates').fmtGreg(next));
  return nextHd.getFullYear() - birthHd.getFullYear();
}

// גיל נוכחי (שכבר מלאו) לפי לועזי — לתצוגה "בן X"
function currentGregorianAge(birthStr, fromDate = new Date()) {
  if (!birthStr) return null;
  const birth = new Date(birthStr + 'T12:00:00');
  const from = stripTime(fromDate);
  let age = from.getFullYear() - birth.getFullYear();
  const hadBirthday =
    from.getMonth() > birth.getMonth() ||
    (from.getMonth() === birth.getMonth() && from.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

// מחזיר תיאור גיל לפי calc_mode של האירוע
function ageForEvent(event, member, fromDate = new Date()) {
  const birthStr = member && member.gregorian_birth;
  if (!birthStr) return { greg: null, hebrew: null, label: '' };
  const greg = gregorianAgeAtNext(birthStr, fromDate);
  const hebrew = hebrewAgeAtNext(birthStr, fromDate);
  let label = '';
  switch (event.calc_mode) {
    case 'hebrew':
      label = hebrew != null ? `גיל ${hebrew} (עברי)` : '';
      break;
    case 'both':
      label = `גיל ${greg}` + (hebrew != null && hebrew !== greg ? ` / ${hebrew} עברי` : '');
      break;
    case 'gregorian':
    default:
      label = greg != null ? `גיל ${greg}` : '';
  }
  return { greg, hebrew, label };
}

module.exports = {
  gregorianAgeAtNext,
  hebrewAgeAtNext,
  currentGregorianAge,
  ageForEvent,
};
