'use strict';

// חישוב גיל אוטומטי (סעיף 10) — כמה שנים מלאו/ימלאו במופע הקרוב.
const { toHDate, nextGregorianAnniversary, nextHebrewAnniversary, stripTime, fmtGreg } = require('./hebrewDates');

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

// מספר שנים שלמות מתאריך לידה עד תאריך יעד (לוח לועזי)
function fullGregYears(birthStr, toDate) {
  const b = new Date(birthStr + 'T12:00:00');
  let y = toDate.getFullYear() - b.getFullYear();
  if (toDate.getMonth() < b.getMonth() || (toDate.getMonth() === b.getMonth() && toDate.getDate() < b.getDate())) y--;
  return y;
}

// גיל בעל האירוע במועד האירוע.
// אירוע חוזר (יום הולדת/נישואין) -> גיל במופע הקרוב הבא.
// אירוע חד-פעמי (בר מצווה/חתונה) -> גיל בתאריך האירוע הקבוע (למשל בר מצווה = 13).
function ageForEvent(event, member, fromDate = new Date()) {
  const birthStr = member && member.gregorian_birth;
  const base = event.gregorian_date;
  if (!birthStr || !base) return { greg: null, hebrew: null, label: '' };

  const oneTime = event.recurring === 0;
  const occG = oneTime ? new Date(base + 'T12:00:00') : nextGregorianAnniversary(base, fromDate);
  const occH = oneTime ? new Date(base + 'T12:00:00') : nextHebrewAnniversary(base, fromDate);

  const greg = fullGregYears(birthStr, occG);
  const hebrew = toHDate(fmtGreg(occH)).getFullYear() - toHDate(birthStr).getFullYear();

  let label = '';
  switch (event.calc_mode) {
    case 'hebrew':
      label = hebrew != null ? `גיל ${hebrew}` : '';
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
