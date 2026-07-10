'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const persistence = require('./persistence');
const instance = require('./instanceConfig');

const PORT = process.env.PORT || instance.port || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// שמירה לענן אחרי שינוי נתונים (מקובצת, כדי לא לשמור על כל בקשה)
let saveTimer = null;
function scheduleSaveAfterWrite() {
  if (!persistence.enabled()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistence.save().catch(() => {}); }, 5000);
}

function buildApp() {
  // חשוב: db והנתיבים נטענים רק *אחרי* שהקובץ שוחזר מהענן
  require('./db'); // אתחול + seed
  const scheduler = require('./services/scheduler');

  const app = express();
  app.set('trust proxy', 1); // מאחורי proxy של הענן (HTTPS)
  app.use(express.json({ limit: '8mb' })); // limit גבוה לתמונות base64
  app.use(cookieParser());

  // בכל בקשה — בדיקת תזכורות (מוגבל לפעם ב-10 דק'). מבטיח שליחה גם בשרת שנרדם.
  app.use((req, res, next) => { scheduler.opportunisticRun(); next(); });

  // כל בקשה שמשנה נתונים -> מתזמנת שמירה לענן
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.on('finish', () => { if (res.statusCode < 400) scheduleSaveAfterWrite(); });
    }
    next();
  });

  // בדיקת חיים — לשירותי "פינג" שמונעים מהשרת להירדם
  app.get('/api/health', (req, res) => res.json({
    ok: true, time: new Date().toISOString(), cloud_db: persistence.enabled(),
  }));

  // הפעלת התזכורות מבחוץ (למתזמן חיצוני). אם הוגדר CRON_TOKEN — נדרש טוקן.
  app.all('/api/cron/run', async (req, res) => {
    const token = process.env.CRON_TOKEN;
    if (token && req.query.token !== token) return res.status(403).json({ error: 'טוקן שגוי' });
    const result = await scheduler.runNow('מתזמן חיצוני');
    res.json({ ok: true, ...result });
  });

  // API
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/members', require('./routes/members'));
  app.use('/api/event-types', require('./routes/eventTypes'));
  app.use('/api/events', require('./routes/events').router);
  app.use('/api/dashboard', require('./routes/dashboard').router);
  app.use('/api/reminders', require('./routes/reminders'));
  app.use('/api/templates', require('./routes/templates'));
  app.use('/api/settings', require('./routes/settings').router);
  app.use('/api/activity', require('./routes/activity'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/families', require('./routes/families'));
  app.use('/api/images', require('./routes/images'));
  app.use('/api/backup', require('./routes/backup'));

  // Static frontend — ללא cache כדי שעדכונים ייטענו תמיד
  app.use(express.static(PUBLIC_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  }));

  // SPA fallback — כל נתיב שאינו API מחזיר את index.html
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // טיפול בשגיאות
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'שגיאת שרת', detail: err.message });
  });

  return { app, scheduler };
}

async function main() {
  // 1) שחזור מסד הנתונים מהענן (אם מוגדר DATABASE_URL) — לפני פתיחת SQLite
  if (persistence.enabled()) {
    const r = await persistence.restore();
    console.log(r.restored
      ? `☁️  מסד הנתונים שוחזר מהענן (${r.bytes} bytes)`
      : `☁️  מסד ענן מחובר — ${r.reason || r.error || 'מתחיל ריק'}`);
  } else {
    console.log('💾 אחסון מקומי בלבד (DATABASE_URL לא מוגדר)');
  }

  // 2) בניית האפליקציה (טוענת את db והנתיבים)
  const { app, scheduler } = buildApp();

  app.listen(PORT, () => {
    const name = instance.configured ? instance.systemName : 'יומן אירועים משפחתי';
    console.log(`\n✅ ${name} פועל על http://localhost:${PORT}`);
    if (instance.configured) console.log(`   כניסת מנהל: ${instance.owner.username}\n`);
    else console.log('   מנהלת-על: brachi5477@gmail.com\n');
    scheduler.start();
  });

  // 3) שמירה אוטומטית תקופתית + בכיבוי
  persistence.startAutoSave();
  if (persistence.enabled()) await persistence.save(true); // עותק ראשוני
}

main().catch((e) => { console.error('כשל בעליית השרת:', e); process.exit(1); });
