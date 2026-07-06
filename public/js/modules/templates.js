'use strict';
// תבניות מייל — עריכה + תצוגה מקדימה חיה

const TemplatesModule = {
  title: 'תבניות מייל',
  icon: '✉️',

  async render(view) {
    view.innerHTML = `
      <div class="page-head">
        <h2>✉️ תבניות מייל</h2>
        <button class="btn btn-primary" id="t-add">➕ תבנית חדשה</button>
      </div>
      <div class="card"><div class="table-wrap"><div id="t-list"></div></div></div>`;
    this.types = await API.get('/event-types');
    view.querySelector('#t-add').onclick = () => this.openEditor();
    this.host = view.querySelector('#t-list');
    await this.load();
  },

  async load() {
    this.rows = await API.get('/templates');
    const typeName = (id) => (this.types.find((t) => t.id == id) || {}).name || '';
    this.host.innerHTML = this.rows.length ? `
      <table class="tbl">
        <thead><tr><th>שם</th><th>סוג אירוע</th><th>כותרת</th><th>פעיל</th><th></th></tr></thead>
        <tbody>${this.rows.map((t) => `
          <tr>
            <td><b>${UI.esc(t.name)}</b></td>
            <td>${UI.esc(typeName(t.type_id))}</td>
            <td>${UI.esc(t.title || '')}</td>
            <td>${t.active ? '✅' : '⛔'}</td>
            <td>
              <button class="btn btn-sm" data-prev="${t.id}">👁️</button>
              <button class="btn btn-sm" data-edit="${t.id}">✏️</button>
              <button class="btn btn-sm btn-danger" data-del="${t.id}">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">אין תבניות</div>';
    this.host.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => this.openEditor(this.rows.find((t) => t.id == b.dataset.edit)));
    this.host.querySelectorAll('[data-prev]').forEach((b) => b.onclick = () => this.preview(this.rows.find((t) => t.id == b.dataset.prev)));
    this.host.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (await UI.confirm('למחוק תבנית?')) { await API.del('/templates/' + b.dataset.del); UI.ok('נמחק'); this.load(); }
    });
  },

  async preview(t) {
    const { html } = await API.post('/templates/preview', t);
    const m = UI.modal('תצוגה מקדימה: ' + t.name,
      `<iframe style="width:100%;height:480px;border:1px solid var(--border);border-radius:10px;background:#fff"></iframe>`, { wide: true });
    m.querySelector('iframe').srcdoc = html;
  },

  openEditor(t) {
    t = t || { bg_color: '#ffffff', text_color: '#222222', accent_color: '#4f8cff' };
    const g = (k) => UI.esc(t[k] || '');
    const typeOpt = this.types.map((x) => `<option value="${x.id}" ${x.id == t.type_id ? 'selected' : ''}>${UI.esc(x.name)}</option>`).join('');
    const body = `
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
        <form id="t-form">
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <div class="field full"><label>שם התבנית *</label><input data-field="name" value="${g('name')}" required></div>
            <div class="field"><label>סוג אירוע</label><select data-field="type_id"><option value="">—</option>${typeOpt}</select></div>
            <div class="field"><label>פעיל</label><select data-field="active"><option value="1" ${t.active !== 0 ? 'selected' : ''}>כן</option><option value="0" ${t.active === 0 ? 'selected' : ''}>לא</option></select></div>
            <div class="field full"><label>כותרת המייל</label><input data-field="title" value="${g('title')}" placeholder="מזל טוב {{name}}!"></div>
            <div class="field full"><label>גוף ההודעה (HTML) — {{name}} {{age}} {{date}} {{title}}</label><textarea data-field="body_html" style="min-height:120px">${g('body_html')}</textarea></div>
            <div class="field"><label>צבע רקע</label><input type="color" data-field="bg_color" value="${t.bg_color || '#ffffff'}"></div>
            <div class="field"><label>צבע טקסט</label><input type="color" data-field="text_color" value="${t.text_color || '#222222'}"></div>
            <div class="field"><label>צבע הדגשה</label><input type="color" data-field="accent_color" value="${t.accent_color || '#4f8cff'}"></div>
            <div class="field"><label>תמונת רקע לכותרת (URL)</label><input data-field="bg_image" value="${g('bg_image')}"></div>
            <div class="field full"><label>חתימה</label><textarea data-field="signature">${g('signature')}</textarea></div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${t.id ? 'שמירה' : 'הוספה'}</button>
            <button type="button" class="btn" id="t-prev">👁️ רענון תצוגה</button>
            <button type="button" class="btn" id="t-cancel">ביטול</button>
          </div>
        </form>
        <div>
          <div class="muted" style="margin-bottom:6px">תצוגה מקדימה חיה</div>
          <iframe id="t-preview" style="width:100%;height:420px;border:1px solid var(--border);border-radius:10px;background:#fff"></iframe>
        </div>
      </div>`;
    const modal = UI.modal(t.id ? 'עריכת תבנית' : 'תבנית חדשה', body, { wide: true });
    const form = modal.querySelector('#t-form');
    const doPreview = async () => {
      const data = UI.formData(form);
      try { const { html } = await API.post('/templates/preview', data); modal.querySelector('#t-preview').srcdoc = html; } catch {}
    };
    form.oninput = doPreview;
    doPreview();
    modal.querySelector('#t-prev').onclick = doPreview;
    modal.querySelector('#t-cancel').onclick = () => UI.closeModal();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(form);
      try {
        if (t.id) await API.put('/templates/' + t.id, data);
        else await API.post('/templates', data);
        UI.closeModal(); UI.ok('נשמר'); this.load();
      } catch (err) { UI.err(err.message); }
    };
  },
};
window.TemplatesModule = TemplatesModule;
