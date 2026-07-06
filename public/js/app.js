'use strict';
// bootstrap ראשי: התחברות, הגדרות, ניווט, ערכת נושא

const MODULE_META = {
  dashboard: { title: 'מסך הבית', icon: '🏠' },
  members: { title: 'בני משפחה', icon: '👥' },
  events: { title: 'אירועים', icon: '🎉' },
  reminders: { title: 'תזכורות', icon: '🔔' },
  templates: { title: 'תבניות מייל', icon: '✉️' },
  reports: { title: 'דוחות', icon: '📊' },
  users: { title: 'משתמשים', icon: '🔐' },
  settings: { title: 'הגדרות', icon: '⚙️' },
  activity: { title: 'לוג פעילות', icon: '📜' },
};

const App = {
  user: null,
  settings: {},

  async init() {
    this.bindLogin();
    this.bindChrome();
    try {
      const { user } = await API.get('/auth/me');
      this.user = user;
      await this.enterApp();
    } catch {
      this.showLogin();
    }
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
    document.getElementById('user-chip').textContent = '👤 ' + (this.user.full_name || this.user.username);
    Router.start();
  },

  async loadSettings() {
    this.settings = await API.get('/settings');
  },

  activeModules() {
    try { return JSON.parse(this.settings.active_modules || '[]'); }
    catch { return Object.keys(MODULE_META); }
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
        const { user } = await API.post('/auth/login', {
          username: document.getElementById('login-username').value,
          password: document.getElementById('login-password').value,
        });
        this.user = user;
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
