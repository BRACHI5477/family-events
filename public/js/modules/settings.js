'use strict';
// הגדרות מערכת

const ALL_MODULES = [
  ['dashboard', 'מסך הבית'], ['members', 'בני משפחה'], ['events', 'אירועים'],
  ['reminders', 'תזכורות'], ['templates', 'תבניות מייל'], ['reports', 'דוחות'],
  ['users', 'משתמשים'], ['settings', 'הגדרות'], ['activity', 'לוג פעילות'],
];

const SettingsModule = {
  title: 'הגדרות',
  icon: '⚙️',

  async render(view) {
    const s = await API.get('/settings');
    let active = [];
    try { active = JSON.parse(s.active_modules || '[]'); } catch { active = []; }

    view.innerHTML = `
      <div class="page-head"><h2>⚙️ הגדרות מערכת</h2></div>
      <form id="s-form">
        <div class="card" style="margin-bottom:18px">
          <h3>🎨 כללי ומיתוג</h3>
          <div class="form-grid">
            <div class="field"><label>שם המערכת</label><input data-field="system_name" value="${UI.esc(s.system_name || '')}"></div>
            <div class="field"><label>לוגו — אימוג'י או תמונה</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input data-field="logo" id="s-logo" value="${UI.esc(s.logo || '')}" style="flex:1" placeholder="אימוג'י, או העלו תמונה">
                <button type="button" class="btn" id="s-logo-upload">🖼️ העלאת תמונה</button>
              </div>
              <div id="s-logo-preview" style="margin-top:8px"></div>
            </div>
            <div class="field"><label>צבע ראשי</label><input type="color" data-field="primary_color" value="${s.primary_color || '#4f8cff'}"></div>
            <div class="field"><label>צבע הדגשה</label><input type="color" data-field="accent_color" value="${s.accent_color || '#ff7a59'}"></div>
            <div class="field"><label>ברירת מחדל לתצוגת תאריך</label><select data-field="default_date_display">
              <option value="combined" ${s.default_date_display === 'combined' ? 'selected' : ''}>משולב</option>
              <option value="hebrew" ${s.default_date_display === 'hebrew' ? 'selected' : ''}>עברי בלבד</option>
              <option value="gregorian" ${s.default_date_display === 'gregorian' ? 'selected' : ''}>לועזי בלבד</option>
            </select></div>
            <div class="field"><label>אזור זמן</label><input data-field="timezone" value="${UI.esc(s.timezone || '')}"></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:18px">
          <h3>📧 דוא"ל (SMTP)</h3>
          <div class="muted" style="margin-bottom:10px">ללא הגדרת SMTP המערכת עובדת במצב תצוגה מקדימה (לא נשלחים מיילים אמיתיים).</div>
          <div class="form-grid">
            <div class="field"><label>שרת SMTP</label><input data-field="smtp_host" value="${UI.esc(s.smtp_host || '')}" placeholder="smtp.gmail.com"></div>
            <div class="field"><label>פורט</label><input data-field="smtp_port" value="${UI.esc(s.smtp_port || '587')}"></div>
            <div class="field"><label>משתמש SMTP</label><input data-field="smtp_user" value="${UI.esc(s.smtp_user || '')}"></div>
            <div class="field"><label>סיסמת SMTP</label><input type="password" data-field="smtp_pass" value="${UI.esc(s.smtp_pass || '')}" placeholder="השאר ריק כדי לא לשנות"></div>
            <div class="field"><label>שם שולח</label><input data-field="sender_name" value="${UI.esc(s.sender_name || '')}"></div>
            <div class="field"><label>כתובת שולח</label><input data-field="sender_email" value="${UI.esc(s.sender_email || '')}"></div>
            <div class="field"><label>הצפנה (SSL)</label><select data-field="smtp_secure">
              <option value="false" ${String(s.smtp_secure) !== 'true' ? 'selected' : ''}>לא (TLS/587)</option>
              <option value="true" ${String(s.smtp_secure) === 'true' ? 'selected' : ''}>כן (SSL/465)</option>
            </select></div>
            <div class="field full"><label>חתימה</label><textarea data-field="signature">${UI.esc(s.signature || '')}</textarea></div>
          </div>
          <div class="form-actions" style="margin-top:12px">
            <button type="button" class="btn" id="s-test-smtp">🔌 בדיקת חיבור SMTP</button>
            <span class="muted" id="s-smtp-result"></span>
          </div>
          <div class="muted" style="margin-top:8px">💡 אם מקבלים "Connection timeout" — הפורט כנראה חסום. נסו פורט <b>2525</b>, או <b>465</b> עם הצפנה SSL.</div>
        </div>

        <div class="card" style="margin-bottom:18px">
          <h3>🧩 מודולים פעילים</h3>
          <div class="chips" id="s-modules">
            ${ALL_MODULES.map(([k, l]) => `<div class="chip-toggle ${active.includes(k) ? 'on' : ''}" data-mod="${k}">${UI.esc(l)}</div>`).join('')}
          </div>
        </div>

        <div class="card" style="margin-bottom:18px">
          <h3>💾 גיבוי ושחזור</h3>
          <div class="muted" style="margin-bottom:10px">ייצוא כל הנתונים לקובץ, או שחזור מקובץ גיבוי (מוחק את הנתונים הקיימים).</div>
          <div class="form-actions">
            <button type="button" class="btn" id="s-export">⬇️ ייצוא גיבוי</button>
            <button type="button" class="btn" id="s-import-btn">⬆️ שחזור מקובץ</button>
            <input type="file" id="s-import-file" accept="application/json" style="display:none">
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">💾 שמירת הגדרות</button>
          <button type="button" class="btn" id="s-pass">🔑 החלפת סיסמה</button>
        </div>
      </form>`;

    // toggle מודולים
    view.querySelectorAll('#s-modules .chip-toggle').forEach((c) => {
      if (c.dataset.mod === 'dashboard' || c.dataset.mod === 'settings') return; // חובה
      c.onclick = () => c.classList.toggle('on');
    });

    // איסוף ושמירת ההגדרות מהטופס (משמש גם את כפתור הבדיקה)
    this.saveSettings = async () => {
      const data = UI.formData(view.querySelector('#s-form'));
      const mods = [...view.querySelectorAll('#s-modules .chip-toggle.on')].map((c) => c.dataset.mod);
      if (!mods.includes('dashboard')) mods.unshift('dashboard');
      if (!mods.includes('settings')) mods.push('settings');
      data.active_modules = JSON.stringify(mods);
      if (!data.smtp_pass) delete data.smtp_pass; // אל תשלח ריק
      await API.put('/settings', data);
    };

    view.querySelector('#s-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await this.saveSettings();
        UI.ok('ההגדרות נשמרו');
        await App.loadSettings();
        App.applyTheme();
        App.buildNav();
      } catch (err) { UI.err(err.message); }
    };

    view.querySelector('#s-pass').onclick = () => this.changePassword();

    // לוגו — העלאת תמונה
    const logoInput = view.querySelector('#s-logo');
    const logoPrev = view.querySelector('#s-logo-preview');
    const renderLogoPreview = () => {
      const v = logoInput.value.trim();
      logoPrev.innerHTML = v.startsWith('data:image')
        ? `<img src="${v}" style="height:60px;border-radius:10px;border:1px solid var(--border)">
           <button type="button" class="btn btn-sm" id="s-logo-clear" style="margin-inline-start:8px">הסרה</button>`
        : (v ? `<span style="font-size:40px">${UI.esc(v)}</span>` : '');
      const clr = logoPrev.querySelector('#s-logo-clear');
      if (clr) clr.onclick = () => { logoInput.value = '👨‍👩‍👧‍👦'; renderLogoPreview(); };
    };
    renderLogoPreview();
    logoInput.oninput = renderLogoPreview;
    view.querySelector('#s-logo-upload').onclick = async () => {
      UI.toast('⏳ מעלה תמונה...');
      const img = await UI.pickImage({ maxSize: 256 });
      if (img) { logoInput.value = img.data_url; renderLogoPreview(); UI.ok('התמונה הועלתה — לחצו "שמירת הגדרות"'); }
    };

    // בדיקת חיבור SMTP — שומר קודם את מה שבטופס, ואז בודק
    view.querySelector('#s-test-smtp').onclick = async (e) => {
      const btn = e.target;
      const out = view.querySelector('#s-smtp-result');
      btn.disabled = true; out.textContent = '⏳ שומר ובודק חיבור...';
      try {
        await this.saveSettings();               // שמירה אוטומטית לפני הבדיקה
        const r = await API.post('/settings/test-smtp', {});
        if (r.ok) { out.textContent = '✅ ' + r.message; UI.ok(r.message); }
        else { out.textContent = '❌ ' + r.error; UI.err(r.error); }
      } catch (err) { out.textContent = '❌ ' + err.message; UI.err(err.message); }
      btn.disabled = false;
    };

    // גיבוי — הורדת קובץ
    view.querySelector('#s-export').onclick = async () => {
      try {
        const res = await fetch('/api/backup/export', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('ייצוא נכשל');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `family-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(url);
        UI.ok('הגיבוי הורד');
      } catch (err) { UI.err(err.message); }
    };
    // שחזור — קריאת קובץ והעלאה
    const fileInput = view.querySelector('#s-import-file');
    view.querySelector('#s-import-btn').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files[0]; if (!file) return;
      if (!(await UI.confirm('השחזור ימחק את כל הנתונים הנוכחיים ויחליף אותם. להמשיך?'))) { fileInput.value = ''; return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const r = await API.post('/backup/import', data);
        UI.ok(`שוחזרו ${r.restored} רשומות. מרענן...`);
        setTimeout(() => location.reload(), 1200);
      } catch (err) { UI.err('שחזור נכשל: ' + err.message); }
      fileInput.value = '';
    };
  },

  changePassword() {
    const modal = UI.modal('החלפת סיסמה', `
      <form id="pw-form">
        <div class="field" style="margin-bottom:12px"><label>סיסמה נוכחית</label><input type="password" data-field="current" required></div>
        <div class="field" style="margin-bottom:12px"><label>סיסמה חדשה</label><input type="password" data-field="next" required></div>
        <div class="form-actions"><button class="btn btn-primary">שמירה</button><button type="button" class="btn" id="pw-cancel">ביטול</button></div>
      </form>`);
    modal.querySelector('#pw-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(modal.querySelector('#pw-form'));
      try { await API.post('/auth/change-password', data); UI.closeModal(); UI.ok('הסיסמה הוחלפה'); }
      catch (err) { UI.err(err.message); }
    };
  },
};
window.SettingsModule = SettingsModule;
