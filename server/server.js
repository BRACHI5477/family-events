'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

require('./db'); // אתחול + seed
const scheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // מאחורי proxy של הענן (HTTPS)
app.use(express.json({ limit: '8mb' })); // limit גבוה לתמונות base64
app.use(cookieParser());

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
app.use('/api/backup', require('./routes/backup'));

// Static frontend
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

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
  console.log(`\n✅ יומן אירועים משפחתי פועל על http://localhost:${PORT}`);
  console.log('   כניסת דמו: admin / 1234\n');
  scheduler.start();
});
