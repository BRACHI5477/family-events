'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

require('./db'); // אתחול + seed
const scheduler = require('./services/scheduler');

const instance = require('./instanceConfig');
const app = express();
const PORT = process.env.PORT || instance.port || 3000;

app.set('trust proxy', 1); // מאחורי proxy של הענן (HTTPS)
app.use(express.json({ limit: '8mb' })); // limit גבוה לתמונות base64
app.use(cookieParser());

// בכל בקשה — בדיקת תזכורות (מוגבל לפעם ב-10 דק'). מבטיח שליחה גם בשרת שנרדם.
app.use((req, res, next) => { scheduler.opportunisticRun(); next(); });

// בדיקת חיים — לשירותי "פינג" שמונעים מהשרת להירדם
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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
app.use('/api/backup', require('./routes/backup'));

// Static frontend — ללא cache כדי שעדכונים ייטענו תמיד
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
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

app.listen(PORT, () => {
  const name = instance.configured ? instance.systemName : 'יומן אירועים משפחתי';
  console.log(`\n✅ ${name} פועל על http://localhost:${PORT}`);
  if (instance.configured) {
    console.log(`   כניסת מנהל: ${instance.owner.username}\n`);
  } else {
    console.log('   מנהלת-על: brachi5477@gmail.com\n');
  }
  scheduler.start();
});
