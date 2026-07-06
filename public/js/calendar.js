'use strict';
// רכיב לוח שנה — תצוגה עברית (ברירת מחדל), חודשית לועזית, שבועית, שנתית.

const Calendar = {
  ref: new Date(),
  view: 'hebrew',   // hebrew | month | week | year
  hyear: null,
  hmonth: null,
  hebData: null,
  occ: {},          // מפה: 'YYYY-MM-DD' -> [occurrences] (לתצוגות לועזיות)
  container: null,
  DOW: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  MONTHS: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],

  async mount(container) {
    this.container = container;
    await this.reload();
  },

  rangeForView() {
    const r = this.ref;
    if (this.view === 'year') {
      return { from: `${r.getFullYear()}-01-01`, to: `${r.getFullYear()}-12-31` };
    }
    if (this.view === 'week') {
      const start = new Date(r); start.setDate(r.getDate() - r.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { from: Hebrew.key(start), to: Hebrew.key(end) };
    }
    const first = new Date(r.getFullYear(), r.getMonth(), 1);
    const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay());
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
    return { from: Hebrew.key(gridStart), to: Hebrew.key(gridEnd) };
  },

  async reload() {
    if (this.view === 'hebrew') {
      const q = this.hmonth ? `?hyear=${this.hyear}&hmonth=${this.hmonth}` : '';
      try {
        const data = await API.get('/dashboard/hebrew-month' + q);
        this.hebData = data;
        this.hyear = data.hyear;
        this.hmonth = data.hmonth;
      } catch (e) { this.hebData = null; }
    } else {
      const { from, to } = this.rangeForView();
      try {
        const list = await API.get(`/dashboard/occurrences?from=${from}&to=${to}`);
        this.occ = {};
        for (const o of list) (this.occ[o.date] = this.occ[o.date] || []).push(o);
      } catch (e) { this.occ = {}; }
    }
    this.render();
  },

  navigate(dir) {
    if (this.view === 'hebrew') {
      const t = dir > 0 ? this.hebData.next : this.hebData.prev;
      this.hyear = t.hyear; this.hmonth = t.hmonth;
      return this.reload();
    }
    const r = this.ref;
    if (this.view === 'year') r.setFullYear(r.getFullYear() + dir);
    else if (this.view === 'week') r.setDate(r.getDate() + dir * 7);
    else r.setMonth(r.getMonth() + dir);
    this.ref = new Date(r);
    this.reload();
  },

  setView(v) {
    this.view = v;
    if (v === 'hebrew') { this.hyear = null; this.hmonth = null; } // חזרה לחודש הנוכחי
    this.reload();
  },

  today() {
    this.ref = new Date();
    this.hyear = null; this.hmonth = null;
    this.reload();
  },

  titleText() {
    if (this.view === 'hebrew' && this.hebData) {
      const d = this.hebData;
      const g = d.days.length ? `${UI.fmtDate(d.days[0].greg)} – ${UI.fmtDate(d.days[d.days.length - 1].greg)}` : '';
      return { main: `${d.monthName} ${d.yearLabel}`, sub: g };
    }
    const r = this.ref;
    if (this.view === 'year') return { main: `${r.getFullYear()}`, sub: '' };
    if (this.view === 'week') {
      const start = new Date(r); start.setDate(r.getDate() - r.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { main: `${start.getDate()}–${end.getDate()} ${this.MONTHS[end.getMonth()]}`, sub: `${Hebrew.month(start)} ${r.getFullYear()}` };
    }
    return { main: `${this.MONTHS[r.getMonth()]} ${r.getFullYear()}`, sub: Hebrew.month(new Date(r.getFullYear(), r.getMonth(), 15)) };
  },

  render() {
    const t = this.titleText();
    const html = `
      <div class="cal-toolbar">
        <div class="view-switch">
          <button data-view="hebrew" class="${this.view === 'hebrew' ? 'active' : ''}">עברי</button>
          <button data-view="month" class="${this.view === 'month' ? 'active' : ''}">לועזי</button>
          <button data-view="week" class="${this.view === 'week' ? 'active' : ''}">שבועי</button>
          <button data-view="year" class="${this.view === 'year' ? 'active' : ''}">שנתי</button>
        </div>
        <button class="btn btn-sm" data-nav="today">היום</button>
        <div class="spacer"></div>
        <button class="btn btn-sm" data-nav="-1">‹</button>
        <div class="cal-title">${t.main}<small>${t.sub}</small></div>
        <button class="btn btn-sm" data-nav="1">›</button>
      </div>
      <div id="cal-body"></div>`;
    this.container.innerHTML = html;
    this.container.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => this.setView(b.dataset.view));
    this.container.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      if (b.dataset.nav === 'today') this.today(); else this.navigate(parseInt(b.dataset.nav, 10));
    });
    const body = this.container.querySelector('#cal-body');
    if (this.view === 'hebrew') this.renderHebrew(body);
    else if (this.view === 'year') this.renderYear(body);
    else this.renderGrid(body, this.view === 'week');
  },

  // תצוגת חודש עברי — הימים לפי הלוח העברי, עם התאמה ללועזי
  renderHebrew(body) {
    const d = this.hebData;
    if (!d) { body.innerHTML = '<div class="empty">שגיאה בטעינת הלוח העברי</div>'; return; }
    const todayKey = Hebrew.key(new Date());
    let h = '<div class="cal-grid">';
    for (const dow of this.DOW) h += `<div class="cal-dow">${dow}</div>`;

    // ריפוד לפני היום הראשון לפי יום השבוע הלועזי
    const firstDow = new Date(d.days[0].greg + 'T12:00:00').getDay();
    for (let i = 0; i < firstDow; i++) h += '<div class="cal-cell other"></div>';

    for (const day of d.days) {
      const gd = new Date(day.greg + 'T12:00:00');
      const isToday = day.greg === todayKey;
      let evHtml = '';
      day.events.slice(0, 3).forEach((e) => {
        evHtml += `<div class="cal-ev" style="background:${UI.esc(e.color)}" title="${UI.esc(e.title)}">${UI.esc(e.icon)} ${UI.esc(e.member_name || e.title)}</div>`;
      });
      if (day.events.length > 3) evHtml += `<div class="cal-more">+${day.events.length - 3} נוספים</div>`;
      h += `<div class="cal-cell ${isToday ? 'today' : ''}" data-day="${day.greg}">
        <div class="daynum"><span class="heb-day">${UI.esc(day.label)}</span><span class="heb">${gd.getDate()}/${gd.getMonth() + 1}</span></div>
        ${evHtml}
      </div>`;
    }
    h += '</div>';
    body.innerHTML = h;
    body.querySelectorAll('.cal-cell[data-day]').forEach((c) => c.onclick = () => this.showDay(c.dataset.day));
  },

  renderGrid(body, isWeek) {
    const r = this.ref;
    let start;
    let cells = isWeek ? 7 : 42;
    if (isWeek) { start = new Date(r); start.setDate(r.getDate() - r.getDay()); }
    else {
      const first = new Date(r.getFullYear(), r.getMonth(), 1);
      start = new Date(first); start.setDate(first.getDate() - first.getDay());
    }
    const todayKey = Hebrew.key(new Date());
    let h = '<div class="cal-grid">';
    for (const d of this.DOW) h += `<div class="cal-dow">${d}</div>`;
    for (let i = 0; i < cells; i++) {
      const day = new Date(start); day.setDate(start.getDate() + i);
      const key = Hebrew.key(day);
      const other = !isWeek && day.getMonth() !== r.getMonth();
      const evs = this.occ[key] || [];
      let evHtml = '';
      evs.slice(0, 3).forEach((e) => {
        evHtml += `<div class="cal-ev" style="background:${UI.esc(e.color)}" title="${UI.esc(e.title)}">${UI.esc(e.icon)} ${UI.esc(e.member_name || e.title)}</div>`;
      });
      if (evs.length > 3) evHtml += `<div class="cal-more">+${evs.length - 3} נוספים</div>`;
      h += `<div class="cal-cell ${other ? 'other' : ''} ${key === todayKey ? 'today' : ''}" data-day="${key}">
        <div class="daynum"><span>${day.getDate()}</span><span class="heb">${Hebrew.day(day)} ${Hebrew.month(day)}</span></div>
        ${evHtml}
      </div>`;
    }
    h += '</div>';
    body.innerHTML = h;
    body.querySelectorAll('.cal-cell').forEach((c) => c.onclick = () => this.showDay(c.dataset.day));
  },

  renderYear(body) {
    const year = this.ref.getFullYear();
    const todayKey = Hebrew.key(new Date());
    let h = '<div class="cal-year">';
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const start = new Date(first); start.setDate(first.getDate() - first.getDay());
      h += `<div class="card mini-month"><h4>${this.MONTHS[m]}</h4><div class="mini-grid">`;
      for (const d of this.DOW) h += `<div class="cal-dow" style="font-size:9px">${d}</div>`;
      for (let i = 0; i < 42; i++) {
        const day = new Date(start); day.setDate(start.getDate() + i);
        if (day.getMonth() !== m) { h += '<div class="mini-cell"></div>'; continue; }
        const key = Hebrew.key(day);
        const has = (this.occ[key] || []).length > 0;
        h += `<div class="mini-cell ${has ? 'has-ev' : ''} ${key === todayKey ? 'today' : ''}" data-day="${key}" title="${has ? (this.occ[key].map(e => e.title).join(', ')) : ''}">${day.getDate()}</div>`;
      }
      h += '</div></div>';
    }
    h += '</div>';
    body.innerHTML = h;
    body.querySelectorAll('.mini-cell[data-day]').forEach((c) => c.onclick = () => this.showDay(c.dataset.day));
  },

  showDay(key) {
    // אירועי היום — מהמפה הלועזית או מהמבנה העברי
    let evs = this.occ[key] || [];
    if (this.view === 'hebrew' && this.hebData) {
      const day = this.hebData.days.find((x) => x.greg === key);
      if (day) evs = day.events;
    }
    const dt = new Date(key + 'T12:00:00');
    const title = `${UI.fmtDate(key)} · ${Hebrew.full(dt)}`;
    let bodyHtml;
    if (!evs.length) bodyHtml = '<div class="empty">אין אירועים ביום זה</div>';
    else bodyHtml = evs.map((e) => `
      <div class="ev-item">
        <div class="ev-icon" style="background:${UI.esc(e.color)}">${UI.esc(e.icon)}</div>
        <div class="ev-body">
          <div class="ev-title">${UI.esc(e.title)}</div>
          <div class="ev-meta">${UI.esc(e.member_name)} ${e.age_label ? '· ' + UI.esc(e.age_label) : ''}${e.location ? ' · 📍 ' + UI.esc(e.location) : ''}</div>
        </div>
      </div>`).join('');
    UI.modal(title, bodyHtml);
  },
};
window.Calendar = Calendar;
