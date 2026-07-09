'use strict';
// ניהול אירועים

const EventsModule = {
  title: 'אירועים',
  icon: '🎉',
  // חודשים עבריים בסדר השנה, עם מספרי החודש של hebcal
  HMONTHS: [[7, 'תשרי'], [8, 'חשוון'], [9, 'כסלו'], [10, 'טבת'], [11, 'שבט'], [12, 'אדר'],
    [13, 'אדר ב׳'], [1, 'ניסן'], [2, 'אייר'], [3, 'סיוון'], [4, 'תמוז'], [5, 'אב'], [6, 'אלול']],

  async render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2>🎉 אירועים</h2>
        <input class="search-input" id="e-search" placeholder="חיפוש...">
        ${App.canEdit() ? '<button class="btn" id="e-types">🏷️ ניהול סוגים</button><button class="btn btn-primary" id="e-add">➕ הוספת אירוע</button>' : '<span class="muted">מצב צפייה בלבד</span>'}
      </div>
      <div class="card"><div class="table-wrap"><div id="e-list"></div></div></div>`;
    this.types = await API.get('/event-types');
    this.members = await API.get('/members');
    this.templates = await API.get('/templates');
    const addBtn = view.querySelector('#e-add'); if (addBtn) addBtn.onclick = () => this.openForm();
    const typesBtn = view.querySelector('#e-types'); if (typesBtn) typesBtn.onclick = () => this.manageTypes();
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
            <td>${App.canEdit() ? `
              <button class="btn btn-sm" data-loc="${e.id}" title="שלח עדכון מיקום לבני משפחה">📍</button>
              <button class="btn btn-sm" data-send="${e.id}" title="שלח מייל בדיקה">✉️</button>
              <button class="btn btn-sm" data-edit="${e.id}">✏️</button>
              <button class="btn btn-sm btn-danger" data-del="${e.id}">🗑️</button>` : '<span class="muted">—</span>'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openForm(this.rows.find((e) => e.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק אירוע זה?')) { await API.del('/events/' + b.dataset.del); UI.ok('נמחק'); this.load(); }
    });
    this.host.querySelectorAll('[data-send]').forEach((b) => b.onclick = () => this.sendNow(b.dataset.send));
    this.host.querySelectorAll('[data-loc]').forEach((b) => b.onclick = () => this.sendLocation(this.rows.find((e) => e.id == b.dataset.loc)));
  },

  // ניהול סוגי אירועים — הוספה ומחיקה
  async manageTypes() {
    const render = (types) => `
      <div id="mt-list">
        ${types.map((t) => `
          <div class="ev-item">
            <div class="ev-icon" style="background:${UI.esc(t.color || '#4f8cff')}">${UI.esc(t.icon || '📅')}</div>
            <div class="ev-body"><div class="ev-title">${UI.esc(t.name)}</div></div>
            <button class="btn btn-sm btn-danger" data-deltype="${t.id}">🗑️ מחק</button>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
        <input id="mt-icon" value="📌" style="width:60px;text-align:center;padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--text)">
        <input id="mt-name" placeholder="שם סוג חדש" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--text)">
        <input type="color" id="mt-color" value="#4f8cff" style="width:52px">
        <button class="btn btn-primary" id="mt-add">הוספה</button>
      </div>`;
    const modal = UI.modal('ניהול סוגי אירועים', render(this.types));
    const rebind = () => {
      modal.querySelector('.modal-body').innerHTML = render(this.types);
      wire();
    };
    const wire = () => {
      modal.querySelectorAll('[data-deltype]').forEach((b) => b.onclick = async () => {
        if (await UI.confirm('למחוק סוג אירוע זה? אירועים שהשתמשו בו יישארו ללא סוג.')) {
          await API.del('/event-types/' + b.dataset.deltype);
          this.types = await API.get('/event-types');
          UI.ok('נמחק'); rebind(); this.load();
        }
      });
      modal.querySelector('#mt-add').onclick = async () => {
        const name = modal.querySelector('#mt-name').value.trim();
        if (!name) { UI.err('יש להזין שם'); return; }
        await API.post('/event-types', {
          name,
          icon: modal.querySelector('#mt-icon').value.trim() || '📌',
          color: modal.querySelector('#mt-color').value,
        });
        this.types = await API.get('/event-types');
        UI.ok('נוסף'); rebind();
      };
    };
    wire();
  },

  async sendLocation(ev) {
    const members = this.members.filter((m) => m.email);
    const body = `
      <div class="field" style="margin-bottom:12px">
        <label>מיקום האירוע</label>
        <input id="loc-address" value="${UI.esc(ev.location || '')}" placeholder="לדוגמה: אולמי הגן, רחוב הרצל 5, תל אביב">
        <div class="muted" style="margin-top:4px">${ev.location ? '' : 'לאירוע זה עדיין אין מיקום — אפשר להזין כאן וגם יישמר לאירוע.'}</div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>נמענים — בחר בני משפחה או הוסף כתובות</label>
        <div class="chips" style="margin:6px 0">
          ${members.map((m) => `<label class="chip-toggle on" data-email="${UI.esc(m.email)}"><input type="checkbox" checked style="display:none">${UI.esc(m.first_name)} </label>`).join('') || '<span class="muted">אין בני משפחה עם דוא"ל</span>'}
        </div>
        <input id="loc-extra" placeholder="כתובות נוספות, מופרדות בפסיק">
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>הערה (אופציונלי)</label>
        <textarea id="loc-note" placeholder="לדוגמה: חניה זמינה מאחורי הבניין"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="loc-send">📍 שליחת עדכון מיקום</button>
        <button class="btn" id="loc-cancel">ביטול</button>
      </div>`;
    const modal = UI.modal('שליחת עדכון מיקום — ' + ev.title, body);
    modal.querySelectorAll('.chip-toggle[data-email]').forEach((c) => c.onclick = () => c.classList.toggle('on'));
    modal.querySelector('#loc-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#loc-send').onclick = async () => {
      const chosen = [...modal.querySelectorAll('.chip-toggle.on[data-email]')].map((c) => c.dataset.email);
      const extra = (modal.querySelector('#loc-extra').value || '').split(',').map((x) => x.trim()).filter(Boolean);
      const recipients = [...new Set([...chosen, ...extra])].join(',');
      if (!recipients) { UI.err('יש לבחור לפחות נמען אחד'); return; }
      const address = modal.querySelector('#loc-address').value.trim();
      const note = modal.querySelector('#loc-note').value.trim();
      try {
        // שמירת המיקום לאירוע אם עודכן
        if (address && address !== (ev.location || '')) {
          await API.put('/events/' + ev.id, { location: address });
          ev.location = address;
        }
        const r = await API.post(`/events/${ev.id}/send-location`, { recipients, note });
        if (r.status === 'sent') { UI.closeModal(); UI.ok(`עדכון המיקום נשלח אל ${r.to}`); }
        else if (r.status === 'preview') this.showPreview(r.html, 'תצוגה מקדימה (SMTP לא מוגדר — לא נשלח מייל אמיתי)');
        else UI.err('כשל שליחה: ' + (r.error || ''));
        this.load();
      } catch (err) { UI.err(err.message); }
    };
  },

  async sendNow(id) {
    UI.toast('⏳ שולח מייל, נא להמתין...');
    try {
      const r = await API.post('/reminders/send-now', { event_id: Number(id) });
      if (r.status === 'sent') UI.ok('המייל נשלח בהצלחה אל ' + (r.to || ''));
      else if (r.status === 'preview') this.showPreview(r.html, 'תצוגה מקדימה (SMTP לא מוגדר — לא נשלח מייל אמיתי)');
      else UI.err('כשל שליחה: ' + (r.error || ''));
      this.load();
    } catch (err) { UI.err('שגיאה: ' + err.message); }
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
          <div class="field"><label>סוג אירוע</label><select id="e-type" data-field="type_id"><option value="">— בחר —</option>${opt(this.types, 'id', 'name', e.type_id)}<option value="__new__">➕ סוג אירוע חדש...</option></select></div>
          <div class="field"><label>בעל האירוע</label><select data-field="member_id"><option value="">— ללא —</option>${this.members.map((m) => `<option value="${m.id}" ${m.id == e.member_id ? 'selected' : ''}>${UI.esc(m.first_name + ' ' + (m.last_name || ''))}</option>`).join('')}</select></div>
          <div class="field full hidden" id="e-newtype">
            <label>שם הסוג החדש</label>
            <div style="display:flex;gap:8px">
              <input id="e-newtype-name" placeholder="שם הסוג" style="flex:1">
              <input id="e-newtype-icon" placeholder="אייקון" value="📌" style="width:70px;text-align:center">
              <input type="color" id="e-newtype-color" value="#4f8cff" style="width:56px">
            </div>
          </div>
          <div class="field full">
            <label>אופן הזנת התאריך</label>
            <div class="view-switch" id="e-datemode" style="width:fit-content">
              <button type="button" data-dm="hebrew">📅 תאריך עברי</button>
              <button type="button" data-dm="gregorian">תאריך לועזי</button>
            </div>
          </div>
          <div class="field heb-block"><label>יום עברי</label><select id="e-hday">${
            Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">${Hebrew.gematriya(i + 1)}</option>`).join('')
          }</select></div>
          <div class="field heb-block"><label>חודש עברי</label><select id="e-hmonth">${
            this.HMONTHS.map(([n, l]) => `<option value="${n}">${l}</option>`).join('')
          }</select></div>
          <div class="field heb-block"><label>שנה עברית</label><select id="e-hyear">${
            (() => { const cur = Hebrew.yearNum(); let o = ''; for (let y = cur + 20; y >= cur - 120; y--) o += `<option value="${y}" ${y === cur ? 'selected' : ''} title="${y}">${Hebrew.gematriya(y)}</option>`; return o; })()
          }</select></div>
          <div class="field greg-block"><label>תאריך (לועזי)</label><input type="date" data-field="gregorian_date" value="${g('gregorian_date')}"></div>
          <div class="field greg-block"><label>מצב חישוב</label><select data-field="calc_mode">
            <option value="gregorian" ${e.calc_mode === 'gregorian' ? 'selected' : ''}>לפי לועזי</option>
            <option value="hebrew" ${e.calc_mode === 'hebrew' ? 'selected' : ''}>לפי עברי</option>
            <option value="both" ${e.calc_mode === 'both' ? 'selected' : ''}>שניהם</option>
          </select></div>
          <div class="field full"><div class="muted" id="e-heb-preview"></div></div>
          <div class="field full">
            <label><input type="checkbox" id="e-recurring" ${e.recurring === 0 ? '' : 'checked'}> 🔁 אירוע חוזר כל שנה (יום הולדת/נישואין). בטל/י לאירוע חד-פעמי (בר מצווה, חתונה) — הגיל יחושב לפי מועד האירוע</label>
          </div>
          <div class="field"><label>צבע</label><input type="color" data-field="color" value="${e.color || '#4f8cff'}"></div>
          <div class="field full"><label>📍 מיקום האירוע</label><input data-field="location" value="${g('location')}" placeholder="אולם / כתובת"></div>
          <div class="field full"><label>הערות</label><textarea data-field="notes">${g('notes')}</textarea></div>
          ${e.id ? '' : `
          <div class="field full" style="border-top:1px solid var(--border);padding-top:12px">
            <label><input type="checkbox" id="e-autorem" checked> 🔔 הכן אוטומטית תזכורת מייל לאירוע</label>
          </div>
          <div class="field" id="e-autorem-when"><label>מתי לשלוח את התזכורת</label>
            <select id="e-remoffset">
              <option value="week" selected>שבוע לפני</option>
              <option value="two_weeks">שבועיים לפני</option>
              <option value="month">חודש לפני</option>
              <option value="three_days">שלושה ימים לפני</option>
              <option value="day_before">יום לפני</option>
              <option value="same_day">באותו יום</option>
            </select>
          </div>`}
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${e.id ? 'שמירה' : 'הוספה'}</button>
          <button type="button" class="btn" id="e-cancel">ביטול</button>
        </div>
      </form>`;
    const modal = UI.modal(e.id ? 'עריכת אירוע' : 'הוספת אירוע', body);
    // הצגת שדות סוג חדש כשנבחר "סוג אירוע חדש"
    const typeSel = modal.querySelector('#e-type');
    const newBox = modal.querySelector('#e-newtype');
    const recChk = modal.querySelector('#e-recurring');
    // ברירת מחדל לחזרתיות לפי סוג האירוע (הולדת/נישואין = חוזר, אחרת חד-פעמי)
    const isRecurringType = (typeId) => {
      const t = this.types.find((x) => x.id == typeId);
      const n = t ? t.name : '';
      return /הולדת|נישואין/.test(n);
    };
    typeSel.onchange = () => {
      newBox.classList.toggle('hidden', typeSel.value !== '__new__');
      if (!e.id && typeSel.value && typeSel.value !== '__new__') recChk.checked = isRecurringType(typeSel.value);
    };

    // מתג עברי/לועזי — עברי כברירת מחדל באירוע חדש
    let dateMode = e.id && e.calc_mode !== 'hebrew' ? 'gregorian' : 'hebrew';
    const hday = modal.querySelector('#e-hday'), hmonth = modal.querySelector('#e-hmonth'), hyear = modal.querySelector('#e-hyear');
    const preview = modal.querySelector('#e-heb-preview');
    const showMode = () => {
      modal.querySelectorAll('.heb-block').forEach((el) => el.classList.toggle('hidden', dateMode !== 'hebrew'));
      modal.querySelectorAll('.greg-block').forEach((el) => el.classList.toggle('hidden', dateMode !== 'gregorian'));
      modal.querySelectorAll('#e-datemode button').forEach((b) => b.classList.toggle('active', b.dataset.dm === dateMode));
      updatePreview();
    };
    const updatePreview = () => {
      if (dateMode !== 'hebrew') { preview.textContent = ''; return; }
      const monthName = (this.HMONTHS.find(([n]) => n == hmonth.value) || [])[1] || '';
      const y = parseInt(hyear.value, 10) || 0;
      preview.textContent = `📅 ${Hebrew.gematriya(parseInt(hday.value, 10))} ${monthName} ${Hebrew.gematriya(y)}`;
    };
    modal.querySelectorAll('#e-datemode button').forEach((b) => b.onclick = () => { dateMode = b.dataset.dm; showMode(); });
    [hday, hmonth, hyear].forEach((el) => { el.oninput = updatePreview; el.onchange = updatePreview; });
    showMode();

    // מתג תזכורת אוטומטית (אירוע חדש בלבד)
    const autoRem = modal.querySelector('#e-autorem');
    if (autoRem) {
      const whenBox = modal.querySelector('#e-autorem-when');
      const syncRem = () => whenBox.classList.toggle('hidden', !autoRem.checked);
      autoRem.onchange = syncRem; syncRem();
    }

    modal.querySelector('#e-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#e-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const data = UI.formData(modal.querySelector('#e-form'));
      // תאריך עברי — נשלח כחלקים, השרת ימיר ללועזי ויקבע חישוב עברי
      if (dateMode === 'hebrew') {
        data.hebrew_day = hday.value;
        data.hebrew_month = hmonth.value;
        data.hebrew_year = hyear.value;
        delete data.gregorian_date;
      }
      data.recurring = recChk.checked ? 1 : 0;
      // תזכורת אוטומטית (רק באירוע חדש)
      if (!e.id) {
        const autoRem = modal.querySelector('#e-autorem');
        data.auto_reminder = autoRem && autoRem.checked;
        data.reminder_offset = (modal.querySelector('#e-remoffset') || {}).value || 'week';
      }
      try {
        // יצירת סוג אירוע חדש אם נבחר
        if (data.type_id === '__new__') {
          const name = modal.querySelector('#e-newtype-name').value.trim();
          if (!name) { UI.err('יש להזין שם לסוג האירוע החדש'); return; }
          const newType = await API.post('/event-types', {
            name,
            icon: modal.querySelector('#e-newtype-icon').value.trim() || '📌',
            color: modal.querySelector('#e-newtype-color').value,
          });
          data.type_id = newType.id;
          this.types.push(newType);
        }
        if (e.id) await API.put('/events/' + e.id, data);
        else await API.post('/events', data);
        UI.closeModal(); UI.ok('נשמר'); this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.EventsModule = EventsModule;
