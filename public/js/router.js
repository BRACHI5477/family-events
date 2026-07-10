'use strict';
// ניתוב פשוט מבוסס hash + רישום מודולים

const Router = {
  modules: {
    dashboard: () => DashboardModule,
    members: () => MembersModule,
    events: () => EventsModule,
    reminders: () => RemindersModule,
    templates: () => TemplatesModule,
    reports: () => ReportsModule,
    families: () => FamiliesModule,
    users: () => UsersModule,
    settings: () => SettingsModule,
    activity: () => ActivityModule,
  },

  current: null,

  start() {
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    const key = (location.hash.replace('#/', '') || 'dashboard');
    const active = App.activeModules();
    const target = active.includes(key) ? key : 'dashboard';
    const mod = (this.modules[target] || this.modules.dashboard)();
    this.current = target;

    document.getElementById('page-title').textContent = mod.title;
    document.querySelectorAll('#nav a').forEach((a) =>
      a.classList.toggle('active', a.dataset.key === target));

    const view = document.getElementById('view');
    view.innerHTML = '<div class="empty">טוען…</div>';
    Promise.resolve(mod.render(view))
      .then(() => UI.attachPasswordToggles(view))
      .catch((err) => {
        view.innerHTML = `<div class="empty">שגיאה בטעינת המסך: ${UI.esc(err.message)}</div>`;
      });
    // סגירת תפריט נייד
    document.getElementById('app').classList.remove('nav-open');
  },

  go(key) { location.hash = '#/' + key; },
};
window.Router = Router;
