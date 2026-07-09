'use strict';

// בדיקת סבב מלא של שמירה/שחזור מסד הנתונים מול Postgres בענן.
// שימוש:  DATABASE_URL="postgresql://..." node scripts/test-cloud-db.js

const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('❌ חסר DATABASE_URL');
  process.exit(1);
}

const persistence = require('../server/persistence');

async function main() {
  console.log('=== 1. חיבור ושמירה ראשונית ===');
  require('../server/db'); // יוצר/פותח את המסד המקומי
  const s1 = await persistence.save(true);
  if (!s1.saved) { console.error('❌ שמירה נכשלה:', s1.error); process.exit(1); }
  console.log(`✅ נשמר לענן (${s1.bytes} bytes)`);

  console.log('\n=== 2. מחיקת הקובץ המקומי (סימולציה של איפוס בענן) ===');
  const file = persistence.DB_FILE;
  const before = fs.statSync(file).size;
  for (const suf of ['', '-wal', '-shm']) {
    const f = file + suf;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log(`✅ הקובץ נמחק (היה ${before} bytes)`);

  console.log('\n=== 3. שחזור מהענן ===');
  const r = await persistence.restore();
  if (!r.restored) { console.error('❌ שחזור נכשל:', r.reason || r.error); process.exit(1); }
  console.log(`✅ שוחזר מהענן (${r.bytes} bytes)`);

  console.log('\n=== 4. אימות שהנתונים שלמים ===');
  delete require.cache[require.resolve('../server/db')];
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  const users = db.prepare('SELECT COUNT(*) c FROM Users').get().c;
  const types = db.prepare('SELECT COUNT(*) c FROM EventTypes').get().c;
  const tpls = db.prepare('SELECT COUNT(*) c FROM EmailTemplates').get().c;
  console.log(`   משתמשים: ${users} | סוגי אירועים: ${types} | תבניות: ${tpls}`);

  if (users > 0 && types >= 12 && tpls >= 12) {
    console.log('\n🎉 הצלחה! הנתונים שורדים מחיקה מלאה של הדיסק.');
  } else {
    console.error('\n❌ הנתונים לא שלמים אחרי השחזור');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
