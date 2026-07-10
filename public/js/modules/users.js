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
              ${u.role === 'pending' ? `<button class="btn btn-sm btn-primary" data-approve="${u.id}">✅ אשר</button>` : `
                <button class="btn btn-sm" data-invite="${u.id}" title="שלח קישור התחברות במייל">📧</button>
                <button class="btn btn-sm" data-edit="${u.id}">✏️</button>`}
              ${u.id === App.user.id ? '' : `<button class="btn btn-sm btn-danger" data-del="${u.id}">${u.role === 'pending' ? '❌ דחה' : '🗑️'}</button>`}
            </td>
          </tr>`).join('')}</tbody>
      </table>`;
    this.host.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => {
      try { await API.post(`/users/${b.dataset.approve}/approve`, {}); UI.ok('הגישה אושרה — המשתמש יכול כעת להיכנס כצופה'); this.load(); }
      catch (e) { UI.err(e.message); }
    });
    this.host.querySelectorAll('[data-invite]').forEach((b) => b.onclick = () => this.sendInvite(rows.find((u) => u.id == b.dataset.invite)));
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(rows.find((u) => u.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק משתמש זה?')) {
        try { await API.del('/users/' + b.dataset.del); UI.ok('נמחק'); this.load(); }
        catch (e) { UI.err(e.message); }
      }
    });
  },

  // שליחת קישור התחברות במייל, עם אפשרות לסיסמה זמנית
  sendInvite(u) {
    const modal = UI.modal('שליחת קישור התחברות', `
      <p class="muted" style="margin-top:0">יישלח מייל אל <b>${UI.esc(u.email || u.username)}</b> עם קישור לכניסה, שם המשתמש וההרשאה.</p>
      <div class="field" style="margin-bottom:12px">
        <label><input type="checkbox" id="inv-setpw"> להגדיר סיסמה זמנית ולכלול אותה במייל</label>
      </div>
      <div class="field hidden" id="inv-pwbox" style="margin-bottom:12px">
        <label>סיסמה זמנית</label><input id="inv-pw" placeholder="לדוגמה: Shalom2026">
        <div class="muted" style="margin-top:4px">⚠️ זה ידרוס את הסיסמה הנוכחית של המשתמש.</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="inv-send">📧 שליחת המייל</button>
        <button class="btn" id="inv-cancel">ביטול</button>
      </div>`);
    const chk = modal.querySelector('#inv-setpw');
    chk.onchange = () => modal.querySelector('#inv-pwbox').classList.toggle('hidden', !chk.checked);
    modal.querySelector('#inv-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#inv-send').onclick = async () => {
      const body = {};
      if (chk.checked) {
        const pw = modal.querySelector('#inv-pw').value.trim();
        if (pw.length < 4) { UI.err('סיסמה זמנית חייבת להכיל לפחות 4 תווים'); return; }
        body.temp_password = pw;
      }
      UI.toast('⏳ שולח מייל...');
      try {
        const r = await API.post(`/users/${u.id}/send-invite`, body);
        UI.closeModal();
        if (r.status === 'sent') UI.ok('ההזמנה נשלחה אל ' + r.to);
        else if (r.status === 'preview') UI.err('SMTP לא מוגדר — המייל לא נשלח');
        else UI.err('כשל שליחה: ' + (r.error || ''));
      } catch (err) { UI.err(err.message); }
    };
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
