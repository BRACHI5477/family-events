'use strict';
// רכיב לוח שנה — תצוגה חודשית / שבועית / שנתית, עברי + לועזי, אירועים בתאים.

const Calendar = {
  ref: new Date(),
  view: 'month',
  occ: {},          // מפה: 'YYYY-MM-DD' -> [occurrences]
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
    // month — כולל שוליים לתצוגת רשת
    const first = new Date(r.getFullYear(), r.getMonth(), 1);
    const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay());
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
    return { from: Hebrew.key(gridStart), to: Hebrew.key(gridEnd) };
  },

  async reload() {
    const { from, to } = this.rangeForView();
    try {
      const list = await API.get(`/dashboard/occurrences?from=${from}&to=${to}`);
      this.occ = {};
      for (const o of list) (this.occ[o.date] = this.occ[o.date] || []).push(o);
    } catch (e) { this.occ = {}; }
    this.render();
  },

  navigate(dir) {
    const r = this.ref;
    if (this.view === 'year') r.setFullYear(r.getFullYear() + dir);
    else if (this.view === 'week') r.setDate(r.getDate() + dir * 7);
    else r.setMonth(r.getMonth() + dir);
    this.ref = new Date(r);
    this.reload();
  },

  setView(v) { this.view = v; this.reload(); },
  today() { this.ref = new Date(); this.reload(); },

  titleText() {
    const r = this.ref;
    if (this.view === 'year') return { main: `${r.getFullYear()}`, sub: Hebrew.full(new Date(r.getFullYear(), 6, 1)).replace(/^.* /, '') };
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
          <button data-view="month" class="${this.view === 'month' ? 'active' : ''}">חודשי</button>
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
    if (this.view === 'year') this.renderYear(body);
    else this.renderGrid(body, this.view === 'week');
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
    const evs = this.occ[key] || [];
    const d = new Date(key + 'T12:00:00');
    const title = `${UI.fmtDate(key)} · ${Hebrew.full(d)}`;
    let body;
    if (!evs.length) body = '<div class="empty">אין אירועים ביום זה</div>';
    else body = evs.map((e) => `
      <div class="ev-item">
        <div class="ev-icon" style="background:${UI.esc(e.color)}">${UI.esc(e.icon)}</div>
        <div class="ev-body">
          <div class="ev-title">${UI.esc(e.title)}</div>
          <div class="ev-meta">${UI.esc(e.member_name)} ${e.age_label ? '· ' + UI.esc(e.age_label) : ''}</div>
        </div>
      </div>`).join('');
    UI.modal(title, body);
  },
};
window.Calendar = Calendar;
