'use strict';

// קונפיגורציה של עותק (instance) עצמאי.
// אם קיים בשורש הפרויקט קובץ instance.config.json — זהו עותק עצמאי ללקוח:
// נוצר מנהל משלו לפי הקונפיג, ללא מנהלת-על גלובלית וללא נתוני דמו.
// אם אין קובץ כזה — מצב "מאסטר/פיתוח" עם ברכי כמנהלת-על ונתוני דמו.

const fs = require('fs');
const path = require('path');

function load() {
  const file = path.join(__dirname, '..', 'instance.config.json');
  let cfg = null;
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error('instance.config.json לא תקין:', e.message); }
  }

  if (!cfg || !cfg.owner) {
    return { configured: false, port: process.env.PORT ? parseInt(process.env.PORT, 10) : null };
  }

  return {
    configured: true,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : (cfg.port || null),
    systemName: process.env.SYSTEM_NAME || cfg.systemName || 'יומן אירועים משפחתי',
    logo: cfg.logo || '👨‍👩‍👧‍👦',
    // 'single' = משפחה אחת (המנהל = admin); 'multi' = מנהל-על שיכול לפתוח כמה משפחות
    mode: process.env.INSTANCE_MODE || cfg.mode || 'single',
    familyName: cfg.familyName || cfg.systemName || 'המשפחה שלי',
    owner: {
      username: process.env.OWNER_USERNAME || cfg.owner.username,
      password: process.env.OWNER_PASSWORD || cfg.owner.password || '1234',
      name: cfg.owner.name || 'מנהל המערכת',
      email: cfg.owner.email || cfg.owner.username,
    },
  };
}

module.exports = load();
