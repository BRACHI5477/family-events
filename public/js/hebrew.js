'use strict';
// פורמט תאריך עברי בצד לקוח — מספרים מ-Intl, אותיות (גימטריה) מחושבות ידנית
// (מנועי דפדפן שונים מחזירים ספרות במקום גימטריה, לכן לא מסתמכים על Intl לאותיות)

// המרת מספר לגימטריה: 21 -> כ״א, 786 -> תשפ״ו
function gematriya(num) {
  const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const HUND = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  let n = num % 1000; // שנים: משמיטים את האלפים (5786 -> 786)
  let s = HUND[Math.floor(n / 100)];
  n %= 100;
  if (n === 15) s += 'טו';
  else if (n === 16) s += 'טז';
  else { s += TENS[Math.floor(n / 10)]; s += ONES[n % 10]; }
  if (!s) return '';
  if (s.length === 1) return s + '׳';                 // גרש לאות בודדת
  return s.slice(0, -1) + '״' + s.slice(-1);          // גרשיים לפני האות האחרונה
}

const Hebrew = {
  gematriya,
  _dayNumFmt: new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric' }),
  _monthFmt: new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' }),
  _yearNumFmt: new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric' }),

  _dayNum(date) { try { return parseInt(this._dayNumFmt.format(date), 10); } catch { return 0; } },
  day(date) { return gematriya(this._dayNum(date)); },
  month(date) { try { return this._monthFmt.format(date); } catch { return ''; } },
  full(date) {
    const y = this.yearNum(date);
    return `${this.day(date)} ${this.month(date)} ${gematriya(y % 1000)}`;
  },
  yearNum(date = new Date()) { try { return parseInt(this._yearNumFmt.format(date), 10) || 5786; } catch { return 5786; } },

  // מפתח תאריך YYYY-MM-DD מקומי (ללא הסטת אזור זמן)
  key(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
};
window.Hebrew = Hebrew;
