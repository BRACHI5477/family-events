'use strict';
// לוג פעילות

const ACTION_LABEL = {
  login: ['כניסה', '🔑'], create: ['הוספה', '➕'], update: ['עדכון', '✏️'],
  delete: ['מחיקה', '🗑️'], email: ['מייל', '✉️'], error: ['שגיאה', '⚠️'],
};

const ActivityModule = {
  title: 'לוג פעילות',
  icon: '📜',

  async render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2>📜 לוג פעילות</h2>
        <select class="search-input" id="a-filter">
          <option value="">כל הפעולות</option>
          ${Object.entries(ACTION_LABEL).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}
        </select>
      </div>
      <div class="card"><div class="table-wrap"><div id="a-list"></div></div></div>`;
    const host = view.querySelector('#a-list');
    const load = async () => {
      const f = view.querySelector('#a-filter').value;
      const rows = await API.get('/activity' + (f ? '?action=' + f : ''));
      host.innerHTML = rows.length ? `
        <table class="tbl">
          <thead><tr><th>תאריך</th><th>פעולה</th><th>ישות</th><th>פירוט</th><th>משתמש</th></tr></thead>
          <tbody>${rows.map((r) => {
            const a = ACTION_LABEL[r.action] || [r.action, '•'];
            return `<tr>
              <td class="muted">${UI.esc(r.created_at)}</td>
              <td>${a[1]} ${UI.esc(a[0])}</td>
              <td>${UI.esc(r.entity || '')}</td>
              <td>${UI.esc(r.detail || '')}</td>
              <td>${UI.esc(r.username || 'מערכת')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : '<div class="empty">אין רשומות</div>';
    };
    view.querySelector('#a-filter').onchange = load;
    await load();
  },
};
window.ActivityModule = ActivityModule;
