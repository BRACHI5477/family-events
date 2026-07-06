'use strict';
// דוחות — סיכומים ואגרגציות

const MONTHS_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

const ReportsModule = {
  title: 'דוחות',
  icon: '📊',

  async render(view) {
    const s = await API.get('/reports/summary');
    const year = new Date().getFullYear();
    const bm = await API.get('/reports/by-month?year=' + year);
    const maxM = Math.max(1, ...bm.months);

    view.innerHTML = `
      <div class="page-head"><h2>📊 דוחות</h2></div>

      <div class="stat-row">
        <div class="stat"><div class="num">${s.membersTotal}</div><div class="lbl">בני משפחה פעילים</div></div>
        <div class="stat"><div class="num">${s.eventsTotal}</div><div class="lbl">אירועים פעילים</div></div>
        <div class="stat"><div class="num">${s.upcoming.length}</div><div class="lbl">אירועים ב-30 יום הקרובים</div></div>
        <div class="stat"><div class="num">${s.reminders.pending}</div><div class="lbl">תזכורות ממתינות</div></div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <h3>🎯 אירועים לפי סוג</h3>
          ${s.byType.map((t) => `
            <div class="ev-item">
              <div class="ev-icon" style="background:${UI.esc(t.color || '#4f8cff')}">${UI.esc(t.icon || '📅')}</div>
              <div class="ev-body"><div class="ev-title">${UI.esc(t.name)}</div></div>
              <span class="ev-badge">${t.c}</span>
            </div>`).join('') || '<div class="empty">אין נתונים</div>'}
        </div>

        <div class="card">
          <h3>✉️ מיילים ותזכורות</h3>
          <div class="ev-item"><div class="ev-body"><div class="ev-title">מיילים נשלחו</div></div><span class="ev-badge badge-sent">${s.emails.sent}</span></div>
          <div class="ev-item"><div class="ev-body"><div class="ev-title">תצוגות מקדימות</div></div><span class="ev-badge">${s.emails.preview}</span></div>
          <div class="ev-item"><div class="ev-body"><div class="ev-title">כשלים</div></div><span class="ev-badge">${s.emails.failed}</span></div>
          <div class="ev-item"><div class="ev-body"><div class="ev-title">תזכורות שנשלחו</div></div><span class="ev-badge badge-sent">${s.reminders.sent}</span></div>
        </div>
      </div>

      <div class="card" style="margin-top:18px">
        <h3>📅 התפלגות אירועים לפי חודש (${year})</h3>
        <div style="display:flex;align-items:flex-end;gap:8px;height:180px;padding-top:10px">
          ${bm.months.map((c, i) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
              <div style="font-size:12px;font-weight:700">${c || ''}</div>
              <div title="${c} אירועים" style="width:100%;background:var(--primary);border-radius:6px 6px 0 0;height:${(c / maxM) * 100}%;min-height:${c ? 6 : 0}px"></div>
              <div class="muted" style="font-size:11px">${MONTHS_HE[i]}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-top:18px">
        <h3>⏰ אירועים קרובים (30 יום)</h3>
        ${s.upcoming.length ? s.upcoming.map((e) => `
          <div class="ev-item">
            <div class="ev-icon" style="background:${UI.esc(e.color)}">${UI.esc(e.icon)}</div>
            <div class="ev-body"><div class="ev-title">${UI.esc(e.member_name || e.title)}</div>
              <div class="ev-meta">${UI.esc(e.type_name)} · ${UI.fmtDate(e.date)} ${e.age_label ? '· ' + UI.esc(e.age_label) : ''}</div></div>
          </div>`).join('') : '<div class="empty">אין אירועים קרובים</div>'}
      </div>`;
  },
};
window.ReportsModule = ReportsModule;
