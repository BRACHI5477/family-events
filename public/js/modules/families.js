'use strict';
// ניהול משפחות — מנהלת-על בלבד

const FamiliesModule = {
  title: 'משפחות',
  icon: '🏘️',

  async render(view) {
    if (!App.isSuper) {
      view.innerHTML = '<div class="empty">מסך זה זמין למנהלת-על בלבד</div>';
      return;
    }
    view.innerHTML = `
      <div class="page-head">
        <h2>🏘️ ניהול משפחות</h2>
        <button class="btn btn-primary" id="f-add">➕ הוספת משפחה</button>
      </div>
      <div class="card"><div class="table-wrap"><div id="f-list"></div></div></div>
      <div class="card" style="margin-top:18px">
        <div class="muted">כל משפחה היא מרחב נפרד עם בני משפחה, אירועים ומשתמשים משלה. בחרי משפחה בתפריט העליון כדי לעבור לנהל אותה.</div>
      </div>`;
    view.querySelector('#f-add').onclick = () => this.openForm();
    this.host = view.querySelector('#f-list');
    await this.load();
  },

  async load() {
    const rows = await API.get('/families');
    this.host.innerHTML = `
      <table class="tbl">
        <thead><tr><th>שם המשפחה</th><th>בני משפחה</th><th>אירועים</th><th>משתמשים</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>${rows.map((f) => `
          <tr>
            <td><b>${UI.esc(f.name)}</b>${f.notes ? `<div class="muted">${UI.esc(f.notes)}</div>` : ''}</td>
            <td>${f.members ?? '—'}</td>
            <td>${f.events ?? '—'}</td>
            <td>${f.users ?? '—'}</td>
            <td>${f.active ? '✅ פעילה' : '⛔ מושבתת'}</td>
            <td>
              <button class="btn btn-sm" data-switch="${f.id}" title="עבור לנהל משפחה זו">↪️</button>
              <button class="btn btn-sm" data-edit="${f.id}">✏️</button>
              <button class="btn btn-sm btn-danger" data-del="${f.id}">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>`;
    this.host.querySelectorAll('[data-switch]').forEach((b) => b.onclick = async () => {
      await App.switchFamily(Number(b.dataset.switch));
      const sw = document.getElementById('family-switcher'); if (sw) sw.value = b.dataset.switch;
    });
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(rows.find((f) => f.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק משפחה זו? כל בני המשפחה, האירועים והמשתמשים שלה יימחקו לצמיתות!')) {
        try {
          await API.del('/families/' + b.dataset.del);
          UI.ok('המשפחה נמחקה');
          const me = await API.get('/auth/me'); App.setMe(me); App.buildFamilySwitcher();
          this.load();
        } catch (e) { UI.err(e.message); }
      }
    });
  },

  openForm(f) {
    f = f || {};
    const body = `
      <form id="f-form">
        <div class="field" style="margin-bottom:12px"><label>שם המשפחה *</label><input data-field="name" value="${UI.esc(f.name || '')}" required></div>
        <div class="field" style="margin-bottom:12px"><label>הערות</label><textarea data-field="notes">${UI.esc(f.notes || '')}</textarea></div>
        ${f.id ? `<div class="field" style="margin-bottom:12px"><label>סטטוס</label><select data-field="active"><option value="1" ${f.active ? 'selected' : ''}>פעילה</option><option value="0" ${!f.active ? 'selected' : ''}>מושבתת</option></select></div>` : ''}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${f.id ? 'שמירה' : 'הוספה'}</button>
          <button type="button" class="btn" id="f-cancel">ביטול</button>
        </div>
      </form>`;
    const modal = UI.modal(f.id ? 'עריכת משפחה' : 'הוספת משפחה', body);
    modal.querySelector('#f-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#f-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(modal.querySelector('#f-form'));
      try {
        if (f.id) await API.put('/families/' + f.id, data);
        else await API.post('/families', data);
        UI.closeModal(); UI.ok('נשמר');
        const me = await API.get('/auth/me'); App.setMe(me); App.buildFamilySwitcher();
        this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.FamiliesModule = FamiliesModule;
