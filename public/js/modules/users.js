'use strict';
// ניהול משתמשים והרשאות (מנהל בלבד)

const ROLE_LABEL = { superadmin: 'מנהלת-על', admin: 'מנהל', editor: 'עורך', viewer: 'צפייה בלבד', pending: '⏳ ממתין לאישור' };

const UsersModule = {
  title: 'משתמשים',
  icon: '🔐',

  async render(view) {
    if (!(App.user.role === 'admin' || App.user.role === 'superadmin')) {
      view.innerHTML = '<div class="empty">אין לך הרשאה לצפות במסך זה (נדרש מנהל)</div>';
      return;
    }
    view.innerHTML = `
      <div class="page-head">
        <h2>🔐 משתמשים והרשאות</h2>
        <button class="btn btn-primary" id="u-add">➕ הוספת משתמש</button>
      </div>
      <div class="card"><div class="table-wrap"><div id="u-list"></div></div></div>
      <div class="card" style="margin-top:18px">
        <h3>ℹ️ רמות הרשאה</h3>
        <div class="muted">
          <b>מנהל</b> — גישה מלאה כולל הגדרות, משתמשים, מחיקה וגיבוי.<br>
          <b>עורך</b> — הוספה ועריכה של בני משפחה, אירועים ותזכורות.<br>
          <b>צפייה בלבד</b> — צפייה בנתונים ללא עריכה.
        </div>
      </div>`;
    view.querySelector('#u-add').onclick = () => this.openForm();
    this.host = view.querySelector('#u-list');
    await this.load();
  },

  async load() {
    const rows = await API.get('/users');
    const famCol = App.isSuper ? '<th>משפחה</th>' : '';
    this.host.innerHTML = `
      <table class="tbl">
        <thead><tr><th>שם משתמש</th><th>שם מלא</th><th>דוא"ל</th><th>הרשאה</th>${famCol}<th>נוצר</th><th></th></tr></thead>
        <tbody>${rows.map((u) => `
          <tr>
            <td><b>${UI.esc(u.username)}</b>${u.id === App.user.id ? ' <span class="muted">(אתה)</span>' : ''}</td>
            <td>${UI.esc(u.full_name || '')}</td>
            <td>${UI.esc(u.email || '')}</td>
            <td><span class="tag" style="background:var(--primary)">${ROLE_LABEL[u.role] || u.role}</span></td>
            ${App.isSuper ? `<td>${UI.esc(u.family_name || (u.role === 'superadmin' ? 'כל המשפחות' : '—'))}</td>` : ''}
            <td class="muted">${UI.esc((u.created_at || '').slice(0, 10))}</td>
            <td>
              ${u.role === 'pending' ? `<button class="btn btn-sm btn-primary" data-approve="${u.id}">✅ אשר</button>` : `<button class="btn btn-sm" data-edit="${u.id}">✏️</button>`}
              ${u.id === App.user.id ? '' : `<button class="btn btn-sm btn-danger" data-del="${u.id}">${u.role === 'pending' ? '❌ דחה' : '🗑️'}</button>`}
            </td>
          </tr>`).join('')}</tbody>
      </table>`;
    this.host.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => {
      try { await API.post(`/users/${b.dataset.approve}/approve`, {}); UI.ok('הגישה אושרה — המשתמש יכול כעת להיכנס כצופה'); this.load(); }
      catch (e) { UI.err(e.message); }
    });
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(rows.find((u) => u.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק משתמש זה?')) {
        try { await API.del('/users/' + b.dataset.del); UI.ok('נמחק'); this.load(); }
        catch (e) { UI.err(e.message); }
      }
    });
  },

  openForm(u) {
    u = u || {};
    const g = (k) => UI.esc(u[k] || '');
    const roles = App.isSuper ? ['superadmin', 'admin', 'editor', 'viewer'] : ['admin', 'editor', 'viewer'];
    const roleOpt = roles.map((r) =>
      `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
    const famField = App.isSuper ? `
          <div class="field"><label>משפחה</label><select data-field="family_id">
            ${App.families.map((f) => `<option value="${f.id}" ${f.id == u.family_id ? 'selected' : ''}>${UI.esc(f.name)}</option>`).join('')}
          </select></div>` : '';
    const body = `
      <form id="u-form">
        <div class="form-grid">
          <div class="field"><label>שם משתמש (או דוא"ל) *</label><input data-field="username" value="${g('username')}" ${u.id ? 'readonly' : 'required'}></div>
          <div class="field"><label>הרשאה</label><select data-field="role">${roleOpt}</select></div>
          ${famField}
          <div class="field"><label>שם מלא</label><input data-field="full_name" value="${g('full_name')}"></div>
          <div class="field"><label>דוא"ל</label><input type="email" data-field="email" value="${g('email')}"></div>
          <div class="field full"><label>סיסמה ${u.id ? '(השאר ריק כדי לא לשנות)' : '*'}</label><input type="password" data-field="password" ${u.id ? '' : 'required'}></div>
        </div>
        <div class="muted" style="margin-bottom:10px">שלחי למשתמש את הקישור למערכת ואת שם המשתמש והסיסמה שהגדרת.</div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${u.id ? 'שמירה' : 'הוספה'}</button>
          <button type="button" class="btn" id="u-cancel">ביטול</button>
        </div>
      </form>`;
    const modal = UI.modal(u.id ? 'עריכת משתמש' : 'הוספת משתמש', body);
    modal.querySelector('#u-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#u-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(modal.querySelector('#u-form'));
      if (u.id && !data.password) delete data.password;
      try {
        if (u.id) await API.put('/users/' + u.id, data);
        else await API.post('/users', data);
        UI.closeModal(); UI.ok('נשמר'); this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.UsersModule = UsersModule;
