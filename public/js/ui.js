'use strict';
// כלי עזר לממשק: escaping, toast, modal, פורמט

const UI = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  toast(msg, type) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 3200);
  },
  ok(m) { this.toast(m, 'ok'); },
  err(m) { this.toast(m, 'err'); },

  // מודל כללי. content = HTML string. מחזיר את אלמנט המודל.
  modal(title, contentHtml, { wide } = {}) {
    this.closeModal();
    const backdrop = this.el(`
      <div class="modal-backdrop">
        <div class="modal" style="${wide ? 'max-width:820px' : ''}">
          <div class="modal-head"><h3>${this.esc(title)}</h3>
            <button class="modal-close" aria-label="סגור">&times;</button></div>
          <div class="modal-body"></div>
        </div>
      </div>`);
    backdrop.querySelector('.modal-body').innerHTML = contentHtml;
    backdrop.querySelector('.modal-close').onclick = () => this.closeModal();
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) this.closeModal(); });
    document.getElementById('modal-root').appendChild(backdrop);
    return backdrop;
  },
  closeModal() { document.getElementById('modal-root').innerHTML = ''; },

  async confirm(msg) {
    return new Promise((resolve) => {
      const m = this.modal('אישור', `
        <p style="margin-top:0">${this.esc(msg)}</p>
        <div class="form-actions">
          <button class="btn btn-danger" id="cf-yes">אישור</button>
          <button class="btn" id="cf-no">ביטול</button>
        </div>`);
      m.querySelector('#cf-yes').onclick = () => { this.closeModal(); resolve(true); };
      m.querySelector('#cf-no').onclick = () => { this.closeModal(); resolve(false); };
    });
  },

  // אוסף ערכים מטופס לפי data-field
  formData(root) {
    const out = {};
    root.querySelectorAll('[data-field]').forEach((inp) => {
      let v = inp.type === 'checkbox' ? (inp.checked ? 1 : 0) : inp.value;
      out[inp.dataset.field] = v === '' ? null : v;
    });
    return out;
  },

  // בחירת תמונה מהמחשב, כיווץ אוטומטי, והעלאה לשרת. מחזיר {id, data_url}
  pickImage({ maxSize = 512 } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/gif,image/webp';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        try {
          const dataUrl = await this._resizeImage(file, maxSize);
          const r = await API.post('/images', { data_url: dataUrl, filename: file.name });
          resolve(r);
        } catch (e) { this.err(e.message || 'העלאת התמונה נכשלה'); resolve(null); }
      };
      input.click();
    });
  },

  // כיווץ התמונה בדפדפן לפני העלאה (חוסך מקום ומונע שגיאת "גדול מדי")
  _resizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('קובץ התמונה פגום'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            const scale = maxSize / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  fmtDate(str) {
    if (!str) return '';
    const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return str;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
};
window.UI = UI;
