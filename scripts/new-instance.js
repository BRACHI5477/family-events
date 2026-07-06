'use strict';

// יצירת עותק (instance) עצמאי חדש של המערכת.
// שימוש אינטראקטיבי:  node scripts/new-instance.js
//   ואז עונים על השאלות.
// שימוש עם קובץ קונפיג:  node scripts/new-instance.js myconfig.json
//   כאשר myconfig.json מכיל: { systemName, familyName, owner:{username,password,name}, mode, logo, port, target }

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SRC_ROOT = path.join(__dirname, '..');
const SKIP_TOP = new Set(['node_modules', 'data', '.git', 'scripts']);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise((res) =>
  rl.question(`${q}${def ? ` [${def}]` : ''}: `, (a) => res((a || '').trim() || def || '')));

function slug(s) {
  return (s || 'instance').replace(/[^\w֐-׿]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'instance';
}

async function gather() {
  // מצב לא-אינטראקטיבי: קובץ קונפיג JSON כארגומנט
  const arg = process.argv[2];
  if (arg && arg.endsWith('.json')) {
    const c = JSON.parse(fs.readFileSync(arg, 'utf8'));
    if (!c.owner || !c.owner.username) throw new Error('חסר owner.username בקובץ הקונפיג');
    const systemName = c.systemName || 'יומן אירועים משפחתי';
    return {
      systemName,
      familyName: c.familyName || systemName,
      ownerUser: c.owner.username,
      ownerPass: c.owner.password || '1234',
      ownerName: c.owner.name || 'מנהל המערכת',
      mode: c.mode === 'multi' ? 'multi' : 'single',
      logo: c.logo || '👨‍👩‍👧‍👦',
      port: parseInt(c.port, 10) || 3000,
      target: path.resolve(c.target || path.join(path.dirname(SRC_ROOT), slug(systemName))),
    };
  }

  // מצב אינטראקטיבי
  console.log('\n=== יצירת עותק עצמאי חדש של יומן האירועים ===\n');
  const systemName = await ask('שם המערכת (יוצג בכותרת)', 'יומן אירועים משפחתי');
  const familyName = await ask('שם המשפחה הראשונה', systemName);
  const ownerUser = await ask('שם משתמש למנהל (מומלץ אימייל)');
  if (!ownerUser) throw new Error('חובה שם משתמש למנהל.');
  const ownerPass = await ask('סיסמת המנהל', '1234');
  const ownerName = await ask('שם מלא של המנהל', 'מנהל המערכת');
  const mode = (await ask('מצב: single = משפחה אחת, multi = כמה משפחות', 'single')).toLowerCase() === 'multi' ? 'multi' : 'single';
  const logo = await ask('אימוג׳י ללוגו', '👨‍👩‍👧‍👦');
  const port = parseInt(await ask('פורט הרצה', '3000'), 10) || 3000;
  const target = path.resolve(await ask('תיקיית יעד', path.join(path.dirname(SRC_ROOT), slug(systemName))));
  return { systemName, familyName, ownerUser, ownerPass, ownerName, mode, logo, port, target };
}

async function main() {
  const { systemName, familyName, ownerUser, ownerPass, ownerName, mode, logo, port, target } = await gather();
  rl.close();

  if (fs.existsSync(target) && fs.readdirSync(target).length) {
    console.error(`\n⚠️  התיקייה ${target} כבר קיימת ואינה ריקה. בחרו תיקייה אחרת.`);
    process.exit(1);
  }

  // העתקת קוד המערכת (ללא node_modules / data / .git / scripts / instance.config.json)
  fs.cpSync(SRC_ROOT, target, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(SRC_ROOT, src);
      if (!rel) return true;
      const top = rel.split(path.sep)[0];
      if (SKIP_TOP.has(top)) return false;
      if (rel === 'instance.config.json') return false;
      return true;
    },
  });

  // כתיבת קונפיג העותק
  const config = {
    systemName, familyName, logo, mode, port,
    owner: { username: ownerUser, password: ownerPass, name: ownerName, email: ownerUser },
  };
  fs.writeFileSync(path.join(target, 'instance.config.json'), JSON.stringify(config, null, 2), 'utf8');

  console.log(`\n✅ נוצר עותק עצמאי חדש: ${target}\n`);
  console.log('הפעלה:');
  console.log(`  cd "${target}"`);
  console.log('  npm install');
  console.log('  npm start');
  console.log(`\nכתובת: http://localhost:${port}`);
  console.log(`כניסת מנהל: ${ownerUser} / ${ownerPass}`);
  console.log('\n(המערכת החדשה עצמאית לחלוטין — מסד נתונים, מנהל ונתונים משלה. אין קשר למערכות אחרות.)\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
