'use strict';
// ניהול בני משפחה — טבלה + טופס הוספה/עריכה/מחיקה/ארכוב

const MembersModule = {
  title: 'בני משפחה',
  icon: '👥',
  showArchived: false,

  async render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2>👥 בני משפחה</h2>
        <label class="muted"><input type="checkbox" id="m-arch"> הצג ארכיון</label>
        <button class="btn btn-primary" id="m-add">➕ הוספת בן משפחה</button>
      </div>
      <div class="card"><div class="table-wrap"><div id="m-list"></div></div></div>`;
    view.querySelector('#m-add').onclick = () => this.openForm();
    const arch = view.querySelector('#m-arch');
    arch.checked = this.showArchived;
    arch.onchange = () => { this.showArchived = arch.checked; this.load(); };
    this.host = view.querySelector('#m-list');
    await this.load();
  },

  async load() {
    const rows = await API.get('/members' + (this.showArchived ? '?archived=1' : ''));
    if (!rows.length) { this.host.innerHTML = '<div class="empty">אין בני משפחה. הוסיפו את הראשון!</div>'; return; }
    this.host.innerHTML = `
      <table class="tbl">
        <thead><tr>
          <th>שם</th><th>כינוי</th><th>קשר</th><th>תאריך לידה</th><th>עברי</th><th>גיל</th><th>טלפון</th><th>דוא"ל</th><th></th>
        </tr></thead>
        <tbody>${rows.map((m) => `
          <tr>
            <td><b>${UI.esc(m.first_name)} ${UI.esc(m.last_name || '')}</b>${m.archived ? ' <span class="muted">(ארכיון)</span>' : ''}</td>
            <td>${UI.esc(m.nickname || '')}</td>
            <td>${UI.esc(m.relation || '')}</td>
            <td>${m.gregorian_birth ? UI.fmtDate(m.gregorian_birth) : ''}</td>
            <td class="muted">${UI.esc(m.hebrew_birth_calc || m.hebrew_birth || '')}</td>
            <td>${m.current_age != null ? m.current_age : ''}</td>
            <td>${UI.esc(m.phone || '')}</td>
            <td>${UI.esc(m.email || '')}</td>
            <td>
              <button class="btn btn-sm" data-edit="${m.id}">✏️</button>
              <button class="btn btn-sm" data-arch="${m.id}" data-val="${m.archived ? 0 : 1}">${m.archived ? '↩️' : '📦'}</button>
              <button class="btn btn-sm btn-danger" data-del="${m.id}">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(rows.find((m) => m.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-arch]').forEach((b) => b.onclick = async () => {
      await API.post(`/members/${b.dataset.arch}/archive`, { archived: b.dataset.val == '1' });
      UI.ok('עודכן'); this.load();
    });
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק בן משפחה זה? הפעולה תמחק גם את האירועים שלו.')) {
        await API.del('/members/' + b.dataset.del); UI.ok('נמחק'); this.load();
      }
    });
  },

  openForm(m) {
    m = m || {};
    const f = (k) => UI.esc(m[k] || '');
    const body = `
      <form id="m-form">
        <div class="form-grid">
          <div class="field"><label>שם פרטי *</label><input data-field="first_name" value="${f('first_name')}" required></div>
          <div class="field"><label>שם משפחה</label><input data-field="last_name" value="${f('last_name')}"></div>
          <div class="field"><label>כינוי</label><input data-field="nickname" value="${f('nickname')}"></div>
          <div class="field"><label>קשר משפחתי</label><input data-field="relation" value="${f('relation')}" placeholder="אבא, אמא, בן..."></div>
          <div class="field"><label>תאריך לידה (לועזי)</label><input type="date" data-field="gregorian_birth" value="${f('gregorian_birth')}"></div>
          <div class="field"><label>תאריך לידה (עברי) — יחושב אוטומטית</label><input data-field="hebrew_birth" value="${f('hebrew_birth')}" placeholder="ריק = חישוב אוטומטי"></div>
          <div class="field"><label>טלפון</label><input data-field="phone" value="${f('phone')}"></div>
          <div class="field"><label>דוא"ל</label><input type="email" data-field="email" value="${f('email')}"></div>
          <div class="field full"><label>כתובת</label><input data-field="address" value="${f('address')}"></div>
          <div class="field full"><label>הערות</label><textarea data-field="notes">${f('notes')}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${m.id ? 'שמירה' : 'הוספה'}</button>
          <button type="button" class="btn" id="m-cancel">ביטול</button>
        </div>
      </form>`;
    const modal = UI.modal(m.id ? 'עריכת בן משפחה' : 'הוספת בן משפחה', body);
    modal.querySelector('#m-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#m-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(modal.querySelector('#m-form'));
      try {
        if (m.id) await API.put('/members/' + m.id, data);
        else await API.post('/members', data);
        UI.closeModal(); UI.ok('נשמר בהצלחה'); this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.MembersModule = MembersModule;
