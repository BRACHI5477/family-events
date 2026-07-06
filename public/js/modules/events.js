'use strict';
// ניהול אירועים

const EventsModule = {
  title: 'אירועים',
  icon: '🎉',

  async render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2>🎉 אירועים</h2>
        <input class="search-input" id="e-search" placeholder="חיפוש...">
        <button class="btn btn-primary" id="e-add">➕ הוספת אירוע</button>
      </div>
      <div class="card"><div class="table-wrap"><div id="e-list"></div></div></div>`;
    this.types = await API.get('/event-types');
    this.members = await API.get('/members');
    this.templates = await API.get('/templates');
    view.querySelector('#e-add').onclick = () => this.openForm();
    view.querySelector('#e-search').oninput = (ev) => this.filter(ev.target.value);
    this.host = view.querySelector('#e-list');
    await this.load();
  },

  async load() {
    this.rows = await API.get('/events');
    this.renderTable(this.rows);
  },

  filter(q) {
    q = (q || '').toLowerCase();
    this.renderTable(this.rows.filter((e) =>
      (e.title + e.member_name + e.type_name).toLowerCase().includes(q)));
  },

  renderTable(rows) {
    if (!rows.length) { this.host.innerHTML = '<div class="empty">אין אירועים.</div>'; return; }
    const CALC = { gregorian: 'לועזי', hebrew: 'עברי', both: 'משולב' };
    this.host.innerHTML = `
      <table class="tbl">
        <thead><tr><th>אירוע</th><th>סוג</th><th>בעל האירוע</th><th>תאריך</th><th>עברי</th><th>המופע הבא</th><th>גיל</th><th>חישוב</th><th>תזכורת</th><th></th></tr></thead>
        <tbody>${rows.map((e) => `
          <tr>
            <td><span class="color-dot" style="background:${UI.esc(e.display_color)}"></span> <b>${UI.esc(e.title)}</b></td>
            <td><span class="tag" style="background:${UI.esc(e.display_color)}">${UI.esc(e.type_icon)} ${UI.esc(e.type_name)}</span></td>
            <td>${UI.esc(e.member_name || '')}</td>
            <td>${e.gregorian_date ? UI.fmtDate(e.gregorian_date) : ''}</td>
            <td class="muted">${UI.esc(e.hebrew_date_text || '')}</td>
            <td>${UI.fmtDate(e.next_gregorian)}</td>
            <td>${UI.esc(e.age ? e.age.label : '')}</td>
            <td>${CALC[e.calc_mode] || ''}</td>
            <td>${e.reminder_sent ? '<span class="ev-badge badge-sent">נשלחה</span>' : (e.reminder_pending ? '<span class="ev-badge badge-pending">מתוכננת</span>' : '<span class="muted">—</span>')}</td>
            <td>
              <button class="btn btn-sm" data-send="${e.id}" title="שלח מייל בדיקה">✉️</button>
              <button class="btn btn-sm" data-edit="${e.id}">✏️</button>
              <button class="btn btn-sm btn-danger" data-del="${e.id}">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(this.rows.find((e) => e.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק אירוע זה?')) { await API.del('/events/' + b.dataset.del); UI.ok('נמחק'); this.load(); }
    });
    this.host.querySelectorAll('[data-send]').forEach((b) => b.onclick = () => this.sendNow(b.dataset.send));
  },

  async sendNow(id) {
    try {
      const r = await API.post('/reminders/send-now', { event_id: Number(id) });
      if (r.status === 'sent') UI.ok('המייל נשלח בהצלחה');
      else if (r.status === 'preview') this.showPreview(r.html, 'תצוגה מקדימה (SMTP לא מוגדר — לא נשלח מייל אמיתי)');
      else UI.err('כשל שליחה: ' + (r.error || ''));
      this.load();
    } catch (err) { UI.err(err.message); }
  },

  showPreview(html, note) {
    const m = UI.modal('תצוגת מייל', `
      <div class="muted" style="margin-bottom:10px">${UI.esc(note || '')}</div>
      <iframe style="width:100%;height:460px;border:1px solid var(--border);border-radius:10px;background:#fff"></iframe>`, { wide: true });
    m.querySelector('iframe').srcdoc = html;
  },

  openForm(e) {
    e = e || {};
    const g = (k) => UI.esc(e[k] || '');
    const opt = (arr, val, label, sel) => arr.map((x) =>
      `<option value="${x[val]}" ${x[val] == sel ? 'selected' : ''}>${UI.esc(x[label])}</option>`).join('');
    const body = `
      <form id="e-form">
        <div class="form-grid">
          <div class="field full"><label>כותרת *</label><input data-field="title" value="${g('title')}" required></div>
          <div class="field"><label>סוג אירוע</label><select data-field="type_id"><option value="">— בחר —</option>${opt(this.types, 'id', 'name', e.type_id)}</select></div>
          <div class="field"><label>בעל האירוע</label><select data-field="member_id"><option value="">— ללא —</option>${this.members.map((m) => `<option value="${m.id}" ${m.id == e.member_id ? 'selected' : ''}>${UI.esc(m.first_name + ' ' + (m.last_name || ''))}</option>`).join('')}</select></div>
          <div class="field"><label>תאריך (לועזי)</label><input type="date" data-field="gregorian_date" value="${g('gregorian_date')}"></div>
          <div class="field"><label>תאריך עברי (אוטומטי)</label><input data-field="hebrew_date" value="${g('hebrew_date')}" placeholder="ריק = חישוב אוטומטי"></div>
          <div class="field"><label>מצב חישוב</label><select data-field="calc_mode">
            <option value="gregorian" ${e.calc_mode === 'gregorian' ? 'selected' : ''}>לפי לועזי</option>
            <option value="hebrew" ${e.calc_mode === 'hebrew' ? 'selected' : ''}>לפי עברי</option>
            <option value="both" ${e.calc_mode === 'both' ? 'selected' : ''}>שניהם</option>
          </select></div>
          <div class="field"><label>צבע</label><input type="color" data-field="color" value="${e.color || '#4f8cff'}"></div>
          <div class="field full"><label>הערות</label><textarea data-field="notes">${g('notes')}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${e.id ? 'שמירה' : 'הוספה'}</button>
          <button type="button" class="btn" id="e-cancel">ביטול</button>
        </div>
      </form>`;
    const modal = UI.modal(e.id ? 'עריכת אירוע' : 'הוספת אירוע', body);
    modal.querySelector('#e-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#e-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const data = UI.formData(modal.querySelector('#e-form'));
      try {
        if (e.id) await API.put('/events/' + e.id, data);
        else await API.post('/events', data);
        UI.closeModal(); UI.ok('נשמר'); this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.EventsModule = EventsModule;
