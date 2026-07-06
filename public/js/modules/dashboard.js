'use strict';
// מסך הבית — לוח שנה + אירועי היום/שבוע/חודש + חיפוש מהיר

const DashboardModule = {
  title: 'מסך הבית',
  icon: '🏠',

  async render(view) {
    view.innerHTML = `
      <div class="grid dash-grid">
        <div>
          <div class="card"><div id="calendar-host"></div></div>
          <div class="card" style="margin-top:18px">
            <h3>🔎 חיפוש מהיר</h3>
            <input class="search-input" id="dash-search" placeholder="חיפוש לפי שם, סוג אירוע..." style="width:100%">
            <div id="dash-search-res" style="margin-top:12px"></div>
          </div>
          <div class="card" style="margin-top:18px">
            <h3>📆 אירועי החודש הקרוב</h3>
            <div id="dash-month"></div>
          </div>
        </div>
        <div>
          <div class="card">
            <h3>⭐ אירועי היום</h3>
            <div class="muted" id="dash-today-heb" style="margin-bottom:10px"></div>
            <div id="dash-today"></div>
          </div>
          <div class="card" style="margin-top:18px">
            <h3>🗓️ אירועי השבוע</h3>
            <div id="dash-week"></div>
          </div>
        </div>
      </div>`;

    await Calendar.mount(view.querySelector('#calendar-host'));

    const s = await API.get('/dashboard/summary');
    view.querySelector('#dash-today-heb').textContent = 'היום: ' + s.today_hebrew;
    this.renderList(view.querySelector('#dash-today'), s.todayEvents, 'אין אירועים היום 🎈');
    this.renderList(view.querySelector('#dash-week'), s.week, 'אין אירועים השבוע');
    this.renderList(view.querySelector('#dash-month'), s.month, 'אין אירועים החודש');

    // חיפוש מהיר על אירועים
    this._all = await API.get('/events');
    const input = view.querySelector('#dash-search');
    input.oninput = () => this.doSearch(input.value, view.querySelector('#dash-search-res'));
  },

  renderList(host, items, emptyMsg) {
    if (!items || !items.length) { host.innerHTML = `<div class="empty">${UI.esc(emptyMsg)}</div>`; return; }
    host.innerHTML = items.map((e) => `
      <div class="ev-item">
        <div class="ev-icon" style="background:${UI.esc(e.color)}">${UI.esc(e.icon)}</div>
        <div class="ev-body">
          <div class="ev-title">${UI.esc(e.member_name || e.title)}</div>
          <div class="ev-meta">${UI.esc(e.type_name)} · ${UI.fmtDate(e.date)} ${e.age_label ? '· ' + UI.esc(e.age_label) : ''}</div>
        </div>
      </div>`).join('');
  },

  doSearch(q, host) {
    q = (q || '').trim();
    if (!q) { host.innerHTML = ''; return; }
    const low = q.toLowerCase();
    const res = (this._all || []).filter((e) =>
      (e.title || '').toLowerCase().includes(low) ||
      (e.member_name || '').toLowerCase().includes(low) ||
      (e.type_name || '').toLowerCase().includes(low));
    if (!res.length) { host.innerHTML = '<div class="empty">לא נמצאו תוצאות</div>'; return; }
    host.innerHTML = res.map((e) => `
      <div class="ev-item">
        <div class="ev-icon" style="background:${UI.esc(e.display_color)}">${UI.esc(e.type_icon)}</div>
        <div class="ev-body">
          <div class="ev-title">${UI.esc(e.title)}</div>
          <div class="ev-meta">${UI.esc(e.member_name)} · המופע הבא: ${UI.fmtDate(e.next_gregorian)} · ${UI.esc(e.age.label || '')}</div>
        </div>
      </div>`).join('');
  },
};
window.DashboardModule = DashboardModule;
