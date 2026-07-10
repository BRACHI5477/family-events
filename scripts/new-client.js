'use strict';

// מחולל משתני סביבה ללקוח חדש (לשימוש הבעלים בלבד).
// מדפיס טבלה מוכנה להעתקה ל-Render. אינו נוגע בשום נתונים.
//
// שימוש:  node scripts/new-client.js
//   ואז עונים על השאלות.

const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise((res) =>
  rl.question(`${q}${def ? ` [${def}]` : ''}: `, (a) => res((a || '').trim() || def || '')));

// פרטי ה-SMTP המשותפים שלך (ניתן לעדכן כאן פעם אחת)
const DEFAULT_SMTP = {
  host: 'smtp-relay.brevo.com',
  port: '2525',
  user: '',      // ← מלאי כאן את ה-Login מ-Brevo כדי לחסוך הקלדה בכל פעם
  pass: '',      // ← ואת ה-SMTP key
  senderEmail: '',
  senderName: 'יומן אירועים משפחתי',
};

function line(key, val) {
  return `${key.padEnd(22)} ${val}`;
}

async function main() {
  console.log('\n=== הקמת לקוח חדש — מחולל משתני סביבה ===\n');

  const clientName = await ask('שם הלקוח (באנגלית, לכתובת. למשל cohen-family)');
  const ownerEmail = await ask('המייל של הלקוח (שם המשתמש שלו לכניסה)');
  const ownerPass = await ask('סיסמה ראשונית ללקוח', 'Family' + Math.floor(1000 + (crypto.randomBytes(2)[0] % 9000)));
  const ownerName = await ask('שם הלקוח שיוצג במערכת', 'מנהל/ת המערכת');
  const dbUrl = await ask('DATABASE_URL מ-Neon (מתחיל ב-postgresql://)');

  const smtpUser = await ask('SMTP_USER (Login מ-Brevo)', DEFAULT_SMTP.user);
  const smtpPass = await ask('SMTP_PASS (מפתח Brevo)', DEFAULT_SMTP.pass);
  const senderEmail = await ask('SENDER_EMAIL (מייל מאומת ב-Brevo)', DEFAULT_SMTP.senderEmail || ownerEmail);

  rl.close();

  const vars = [
    ['DATABASE_URL', dbUrl],
    ['SUPERADMIN_USERNAME', ownerEmail],
    ['SUPERADMIN_PASSWORD', ownerPass],
    ['SUPERADMIN_NAME', ownerName],
    ['SMTP_HOST', DEFAULT_SMTP.host],
    ['SMTP_PORT', DEFAULT_SMTP.port],
    ['SMTP_USER', smtpUser],
    ['SMTP_PASS', smtpPass],
    ['SENDER_EMAIL', senderEmail],
    ['SENDER_NAME', DEFAULT_SMTP.senderName],
  ];

  console.log('\n\n========================================================');
  console.log(`  משתני סביבה ל-Render — לקוח: ${clientName}`);
  console.log('========================================================');
  console.log('  (העתיקי כל שורה: השם משמאל, הערך מימין)\n');
  for (const [k, v] of vars) console.log('  ' + line(k, v || '(חסר! מלאי ידנית)'));
  console.log('\n========================================================');

  console.log('\n  📋 שם השירות ב-Render:  ' + clientName);
  console.log('  🌐 כתובת שתתקבל:        https://' + clientName + '.onrender.com');
  console.log('  🏓 פינג ל-cron-job.org: https://' + clientName + '.onrender.com/api/health');

  console.log('\n  ✉️  הודעה לשליחה ללקוח:');
  console.log('  ----------------------------------------');
  console.log('  שלום! המערכת שלך מוכנה 🎉');
  console.log('  כתובת: https://' + clientName + '.onrender.com');
  console.log('  שם משתמש: ' + ownerEmail);
  console.log('  סיסמה: ' + ownerPass);
  console.log('  מומלץ להחליף סיסמה אחרי הכניסה: הגדרות → החלפת סיסמה.');
  console.log('  ----------------------------------------\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
