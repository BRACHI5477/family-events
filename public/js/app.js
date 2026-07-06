'use strict';
// bootstrap ראשי: התחברות, הגדרות, ניווט, ערכת נושא

const MODULE_META = {
  dashboard: { title: 'מסך הבית', icon: '🏠' },
  members: { title: 'בני משפחה', icon: '👥' },
  events: { title: 'אירועים', icon: '🎉' },
  reminders: { title: 'תזכורות', icon: '🔔' },
  templates: { title: 'תבניות מייל', icon: '✉️' },
  reports: { title: 'דוחות', icon: '📊' },
  families: { title: 'משפחות', icon: '🏘️' },
  users: { title: 'משתמשים', icon: '🔐' },
  settings: { title: 'הגדרות', icon: '⚙️' },
  activity: { title: 'לוג פעילות', icon: '📜' },
};

const App = {
  user: null,
  settings: {},
  isSuper: false,
  families: [],
  currentFamily: null,

  async init() {
    this.bindLogin();
    this.bindChrome();
    try {
      const me = await API.get('/auth/me');
      this.setMe(me);
      await this.enterApp();
    } catch {
      this.showLogin();
    }
  },

  setMe(me) {
    this.user = me.user;
    this.isSuper = me.is_super;
    this.families = me.families || [];
    this.currentFamily = me.current_family;
  },

  // האם למשתמש הנוכחי יש הרשאת עריכה (לא צופה בלבד)
  canEdit() {
    const r = this.user && this.user.role;
    return r === 'editor' || r === 'admin' || r === 'superadmin';
  },

  showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  async enterApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    await this.loadSettings();
    this.applyTheme();
    this.applyBranding();
    this.buildNav();
    this.buildFamilySwitcher();
    document.getElementById('user-chip').textContent = '👤 ' + (this.user.full_name || this.user.username)
      + (this.isSuper ? ' · מנהלת-על' : '');
    Router.start();
  },

  // מחליף משפחה למנהלת-על (בתפריט העליון)
  buildFamilySwitcher() {
    const host = document.getElementById('topbar-right');
    const existing = document.getElementById('family-switcher');
    if (existing) existing.remove();
    if (!this.isSuper || !this.families.length) return;
    const sel = document.createElement('select');
    sel.id = 'family-switcher';
    sel.className = 'search-input';
    sel.style.minWidth = '150px';
    sel.innerHTML = this.families.map((f) =>
      `<option value="${f.id}" ${f.id === this.currentFamily ? 'selected' : ''}>🏘️ ${UI.esc(f.name)}</option>`).join('');
    sel.onchange = () => this.switchFamily(Number(sel.value));
    host.insertBefore(sel, host.firstChild);
  },

  async switchFamily(familyId) {
    await API.post('/auth/family-context', { family_id: familyId });
    this.currentFamily = familyId;
    UI.ok('עברת למשפחה: ' + (this.families.find((f) => f.id === familyId) || {}).name);
    Router.route(); // רענון המסך הנוכחי
  },

  async loadSettings() {
    this.settings = await API.get('/settings');
  },

  activeModules() {
    let base;
    try { base = JSON.parse(this.settings.active_modules || '[]'); }
    catch { base = Object.keys(MODULE_META); }
    // מודול משפחות — למנהלת-על בלבד (מוזרק אחרי דוחות)
    if (this.isSuper && !base.includes('families')) {
      const i = base.indexOf('reports');
      base = i >= 0 ? [...base.slice(0, i + 1), 'families', ...base.slice(i + 1)] : ['families', ...base];
    }
    // מודול משתמשים — למנהל ומעלה בלבד
    const role = this.user && this.user.role;
    if (!(role === 'admin' || role === 'superadmin')) base = base.filter((m) => m !== 'users');
    return base;
  },

  applyBranding() {
    const name = this.settings.system_name || 'יומן אירועים משפחתי';
    const logo = this.settings.logo || '👨‍👩‍👧‍👦';
    document.getElementById('brand-name').textContent = name;
    document.getElementById('brand-logo').textContent = logo;
    document.title = name;
  },

  applyTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('theme-toggle').textContent = saved === 'dark' ? '☀️' : '🌙';
    // צבעי מותג מההגדרות
    if (this.settings.primary_color) document.documentElement.style.setProperty('--primary', this.settings.primary_color);
    if (this.settings.accent_color) document.documentElement.style.setProperty('--accent', this.settings.accent_color);
  },

  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    this.applyTheme();
  },

  buildNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = this.activeModules().map((key) => {
      const m = MODULE_META[key]; if (!m) return '';
      return `<a href="#/${key}" data-key="${key}"><span class="ico">${m.icon}</span>${m.title}</a>`;
    }).join('');
  },

  bindLogin() {
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      try {
        await API.post('/auth/login', {
          username: document.getElementById('login-username').value,
          password: document.getElementById('login-password').value,
        });
        const me = await API.get('/auth/me');
        this.setMe(me);
        await this.enterApp();
      } catch (err) { errEl.textContent = err.message; }
    };
    document.getElementById('link-forgot').onclick = async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value || prompt('שם משתמש לאיפוס:');
      if (!username) return;
      const r = await API.post('/auth/forgot-password', { username });
      UI.ok(r.message || 'אם המשתמש קיים, נשלחה הנחיה');
    };
    const reqLink = document.getElementById('link-request');
    if (reqLink) reqLink.onclick = (e) => { e.preventDefault(); this.requestAccess(); };
  },

  // בקשת גישה כצופה (מבן משפחה) — ממתינה לאישור המנהל
  requestAccess() {
    const modal = UI.modal('בקשת גישה לצפייה', `
      <p class="muted" style="margin-top:0">מלא/י את הפרטים. הגישה תינתן רק לאחר אישור מנהל המערכת.</p>
      <form id="ra-form">
        <div class="field" style="margin-bottom:12px"><label>שם מלא</label><input data-field="full_name" required></div>
        <div class="field" style="margin-bottom:12px"><label>שם משתמש (או דוא"ל)</label><input data-field="username" required></div>
        <div class="field" style="margin-bottom:12px"><label>סיסמה</label><input type="password" data-field="password" required></div>
        <div class="form-actions"><button class="btn btn-primary">שליחת בקשה</button><button type="button" class="btn" id="ra-cancel">ביטול</button></div>
      </form>`);
    modal.querySelector('#ra-cancel').onclick = () => UI.closeModal();
    modal.querySelector('#ra-form').onsubmit = async (e) => {
      e.preventDefault();
      const data = UI.formData(modal.querySelector('#ra-form'));
      try {
        const r = await API.post('/auth/request-access', data);
        UI.closeModal(); UI.ok(r.message || 'הבקשה נשלחה וממתינה לאישור');
      } catch (err) { UI.err(err.message); }
    };
  },

  bindChrome() {
    document.getElementById('theme-toggle').onclick = () => this.toggleTheme();
    document.getElementById('btn-logout').onclick = async () => {
      await API.post('/auth/logout'); location.hash = ''; location.reload();
    };
    document.getElementById('menu-btn').onclick = () => document.getElementById('app').classList.toggle('nav-open');
    document.getElementById('sidebar-overlay').onclick = () => document.getElementById('app').classList.remove('nav-open');
  },
};
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
