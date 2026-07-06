'use strict';
// תזכורות — חוקי תזכורת לאירועים + רשימת תזכורות מתוכננות

const OFFSETS = [
  ['month', 'חודש לפני'], ['two_weeks', 'שבועיים לפני'], ['week', 'שבוע לפני'],
  ['three_days', 'שלושה ימים לפני'], ['day_before', 'יום לפני'], ['same_day', 'באותו יום'],
  ['day_after', 'יום אחרי'], ['custom', 'מספר ימים מותאם'],
];
const OFFSET_LABEL = Object.fromEntries(OFFSETS);

const RemindersModule = {
  title: 'תזכורות',
  icon: '🔔',

  async render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2>🔔 תזכורות</h2>
        <button class="btn" id="r-gen">🔄 רענון תזכורות</button>
        <button class="btn btn-primary" id="r-add">➕ כלל תזכורת חדש</button>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card"><h3>⚙️ כללי תזכורת</h3><div id="r-rules"></div></div>
        <div class="card"><h3>📋 תזכורות מתוכננות</h3><div id="r-planned"></div></div>
      </div>`;
    this.events = await API.get('/events');
    this.templates = await API.get('/templates');
    view.querySelector('#r-add').onclick = () => this.openForm();
    view.querySelector('#r-gen').onclick = async () => { const r = await API.post('/reminders/generate'); UI.ok(`נוצרו ${r.created} תזכורות`); this.load(); };
    this.rulesHost = view.querySelector('#r-rules');
    this.plannedHost = view.querySelector('#r-planned');
    await this.load();
  },

  async load() {
    const rules = await API.get('/reminders/rules');
    const planned = await API.get('/reminders');
    const evName = (id) => (this.events.find((e) => e.id == id) || {}).title || ('#' + id);

    this.rulesHost.innerHTML = rules.length ? rules.map((r) => `
      <div class="ev-item">
        <div class="ev-body">
          <div class="ev-title">${UI.esc(evName(r.event_id))}</div>
          <div class="ev-meta">${OFFSET_LABEL[r.offset_type] || r.offset_type}${r.offset_type === 'custom' ? ` (${r.custom_days} ימים)` : ''} · שעה ${UI.esc(r.send_time || '')} ${r.recipients ? '· ' + UI.esc(r.recipients) : ''}</div>
        </div>
        <button class="btn btn-sm" data-edit="${r.id}">✏️</button>
        <button class="btn btn-sm btn-danger" data-del="${r.id}">🗑️</button>
      </div>`).join('') : '<div class="empty">אין כללי תזכורת</div>';
    this.rulesHost.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(rules.find((r) => r.id == b.dataset.edit)));
    this.rulesHost.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק כלל תזכורת?')) { await API.del('/reminders/rules/' + b.dataset.del); UI.ok('נמחק'); this.load(); }
    });

    const STAT = { pending: ['מתוכננת', 'badge-pending'], sent: ['נשלחה', 'badge-sent'], failed: ['נכשלה', ''] };
    this.plannedHost.innerHTML = planned.length ? planned.map((p) => `
      <div class="ev-item">
        <div class="ev-body">
          <div class="ev-title">${UI.esc(p.event_title || '')}</div>
          <div class="ev-meta">${UI.fmtDate(p.scheduled_for)} · ${OFFSET_LABEL[p.offset_type] || ''}</div>
        </div>
        <span class="ev-badge ${(STAT[p.status] || [])[1] || ''}">${(STAT[p.status] || [p.status])[0]}</span>
      </div>`).join('') : '<div class="empty">אין תזכורות מתוכננות</div>';
  },

  openForm(r) {
    r = r || {};
    const evOpt = this.events.map((e) => `<option value="${e.id}" ${e.id == r.event_id ? 'selected' : ''}>${UI.esc(e.title)}</option>`).join('');
    const offOpt = OFFSETS.map(([v, l]) => `<option value="${v}" ${v === r.offset_type ? 'selected' : ''}>${l}</option>`).join('');
    const tplOpt = this.templates.map((t) => `<option value="${t.id}" ${t.id == r.template_id ? 'selected' : ''}>${UI.esc(t.name)}</option>`).join('');
    const body = `
      <form id="r-form">
        <div class="form-grid">
          <div class="field full"><label>אירוע *</label><select data-field="event_id" required><option value="">— בחר —</option>${evOpt}</select></div>
          <div class="field"><label>מתי לתזכר</label><select data-field="offset_type">${offOpt}</select></div>
          <div class="field"><label>ימים מותאמים (אם נבחר "מותאם")</label><input type="number" data-field="custom_days" value="${UI.esc(r.custom_days || '')}"></div>
          <div class="field"><label>שעת שליחה</label><input type="time" data-field="send_time" value="${UI.esc(r.send_time || '08:00')}"></div>
          <div class="field"><label>תבנית מייל</label><select data-field="template_id"><option value="">ברירת מחדל של הסוג</option>${tplOpt}</select></div>
          <div class="field full"><label>נמענים (מיילים מופרדים בפסיק) — ריק = מייל בעל האירוע</label><input data-field="recipients" value="${UI.esc(r.recipients || '')}"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${r.id ? 'שמירה' : 'הוספה'}</button>
          <button type="button" class="btn" id="r-cancel">ביטול</button>
        </div>
      </form>`;
    const modal = UI.modal(r.id ? 'עריכת כלל תזכורת' : 'כלל תזכורת חדש', body);
    modal.querySelector('#r-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#r-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(modal.querySelector('#r-form'));
      try {
        if (r.id) await API.put('/reminders/rules/' + r.id, data);
        else await API.post('/reminders/rules', data);
        UI.closeModal(); UI.ok('נשמר'); this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.RemindersModule = RemindersModule;
