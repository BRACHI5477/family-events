'use strict';
// פורמט תאריך עברי בצד לקוח באמצעות Intl (לוח עברי מובנה בדפדפן)

const Hebrew = {
  _dayFmt: new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric' }),
  _monthFmt: new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' }),
  _fullFmt: new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }),

  day(date) { try { return this._dayFmt.format(date); } catch { return ''; } },
  month(date) { try { return this._monthFmt.format(date); } catch { return ''; } },
  full(date) { try { return this._fullFmt.format(date); } catch { return ''; } },

  // מפתח תאריך YYYY-MM-DD מקומי (ללא הסטת אזור זמן)
  key(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
};
window.Hebrew = Hebrew;
