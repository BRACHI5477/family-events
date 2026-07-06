'use strict';

// עטיפה סביב @hebcal/core להמרות עברי<->לועזי, פורמט, וחישוב מופע הבא.
const { HDate, gematriya } = require('@hebcal/core');

const HEB_MONTHS = {
  1: 'ניסן', 2: 'אייר', 3: 'סיון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשון', 9: 'כסלו', 10: 'טבת', 11: 'שבט',
  12: 'אדר', 13: 'אדר ב׳', 14: 'אדר א׳',
};

// המרת אובייקט Date (או YYYY-MM-DD) ל-HDate
function toHDate(input) {
  const d = input instanceof Date ? input : new Date(input + 'T12:00:00');
  return new HDate(d);
}

// לועזי -> תיאור עברי בטקסט: "כ״ה בניסן תשמ״ה"
function gregorianToHebrewText(gregorianStr) {
  if (!gregorianStr) return '';
  try {
    const hd = toHDate(gregorianStr);
    const day = gematriya(hd.getDate());
    const monthName = HEB_MONTHS[hd.getMonth()] || (hd.getMonthName ? hd.getMonthName() : '');
    const year = gematriya(hd.getFullYear());
    return `${day} ${monthName} ${year}`;
  } catch (e) {
    return '';
  }
}

// פרטי התאריך העברי (day/month/year מספריים) לצורך חישובים
function hebrewParts(gregorianStr) {
  const hd = toHDate(gregorianStr);
  return { day: hd.getDate(), month: hd.getMonth(), year: hd.getFullYear(), name: hd.getMonthName() };
}

// המופע הבא (בלוח העברי) של יום/חודש עברי מתוך תאריך לידה — מוחזר כתאריך לועזי (Date).
// כלומר: יום ההולדת העברי הקרוב מהיום.
function nextHebrewAnniversary(gregorianBirthStr, fromDate = new Date()) {
  const birth = toHDate(gregorianBirthStr);
  const bMonth = birth.getMonth();
  const bDay = birth.getDate();
  const fromHd = new HDate(fromDate);
  let year = fromHd.getFullYear();

  for (let i = 0; i < 3; i++) {
    try {
      const candidate = new HDate(bDay, bMonth, year + i);
      const g = candidate.greg();
      if (g >= stripTime(fromDate)) return g;
    } catch (e) {
      // חודש שלא קיים בשנה זו (למשל אדר ב׳) — דלג
    }
  }
  return birth.greg();
}

// המופע הבא (בלוח הלועזי) של תאריך — מוחזר כ-Date
function nextGregorianAnniversary(gregorianStr, fromDate = new Date()) {
  const src = new Date(gregorianStr + 'T12:00:00');
  const from = stripTime(fromDate);
  let candidate = new Date(from.getFullYear(), src.getMonth(), src.getDate());
  if (candidate < from) candidate = new Date(from.getFullYear() + 1, src.getMonth(), src.getDate());
  return candidate;
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtGreg(d) {
  const dt = d instanceof Date ? d : new Date(d + 'T12:00:00');
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// המרת חלקי תאריך עברי (יום, חודש hebcal, שנה) -> תאריך לועזי YYYY-MM-DD
function hebrewPartsToGreg(hday, hmonth, hyear) {
  let d = Number(hday), m = Number(hmonth), y = Number(hyear);
  // אדר ב׳ (13) בשנה שאינה מעוברת -> אדר (12)
  if (m === 13 && !HDate.isLeapYear(y)) m = 12;
  const hd = new HDate(d, m, y);
  return fmtGreg(hd.greg());
}

// השנה העברית הנוכחית (מספרית)
function currentHebrewYear(fromDate = new Date()) {
  return new HDate(fromDate).getFullYear();
}

module.exports = {
  toHDate,
  gregorianToHebrewText,
  hebrewParts,
  hebrewPartsToGreg,
  currentHebrewYear,
  nextHebrewAnniversary,
  nextGregorianAnniversary,
  stripTime,
  fmtGreg,
  HEB_MONTHS,
};
