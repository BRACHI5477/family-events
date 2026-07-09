'use strict';

// שכבת התמדה: מסנכרנת את קובץ ה-SQLite אל מסד נתונים ענני (Postgres).
// מטרה: בענן חינמי (Render) הדיסק זמני והנתונים נמחקים. כאן שומרים עותק
// של הקובץ ב-Postgres חיצוני (Neon/Supabase), טוענים אותו בעליית השרת,
// ושומרים אותו בכל שינוי. כל שאר הקוד ממשיך לעבוד מול SQLite כרגיל.
//
// מופעל רק אם הוגדר משתנה הסביבה DATABASE_URL. אחרת — לא עושה כלום.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'family.db');
const URL = process.env.DATABASE_URL;

let pool = null;
let lastSavedMtime = 0;
let saving = false;

function enabled() { return !!URL; }

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: URL,
      ssl: { rejectUnauthorized: false },   // נדרש ע"י Neon/Supabase
      max: 2,
    });
  }
  return pool;
}

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS db_snapshot (
      id INT PRIMARY KEY,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

// טעינת עותק הקובץ מהענן (נקרא לפני שפותחים את SQLite)
async function restore() {
  if (!enabled()) return { restored: false, reason: 'DATABASE_URL לא מוגדר' };
  try {
    await ensureTable();
    const r = await getPool().query('SELECT data FROM db_snapshot WHERE id = 1');
    if (!r.rows.length) return { restored: false, reason: 'אין עדיין גיבוי בענן' };

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // מנקים שרידי WAL כדי שהקובץ המשוחזר יהיה מקור האמת
    for (const suffix of ['-wal', '-shm']) {
      const f = DB_FILE + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    fs.writeFileSync(DB_FILE, r.rows[0].data);
    lastSavedMtime = fs.statSync(DB_FILE).mtimeMs;
    return { restored: true, bytes: r.rows[0].data.length };
  } catch (e) {
    console.error('שחזור מהענן נכשל:', e.message);
    return { restored: false, error: e.message };
  }
}

// שמירת הקובץ לענן. force = לשמור גם אם לא זוהה שינוי.
async function save(force = false) {
  if (!enabled() || saving) return { saved: false };
  if (!fs.existsSync(DB_FILE)) return { saved: false };

  try {
    // מאחדים את ה-WAL לתוך הקובץ הראשי כדי שהעותק יהיה שלם
    try { require('./db').exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) { /* ignore */ }

    const mtime = fs.statSync(DB_FILE).mtimeMs;
    if (!force && mtime === lastSavedMtime) return { saved: false, reason: 'ללא שינוי' };

    saving = true;
    const data = fs.readFileSync(DB_FILE);
    await ensureTable();
    await getPool().query(
      `INSERT INTO db_snapshot (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [data]
    );
    lastSavedMtime = mtime;
    return { saved: true, bytes: data.length };
  } catch (e) {
    console.error('שמירה לענן נכשלה:', e.message);
    return { saved: false, error: e.message };
  } finally {
    saving = false;
  }
}

// שמירה תקופתית + שמירה בכיבוי מסודר
function startAutoSave(intervalMs = 60000) {
  if (!enabled()) return;
  setInterval(() => { save().catch(() => {}); }, intervalMs).unref();

  const onExit = async () => {
    await save(true).catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', onExit);   // Render שולח זאת לפני כיבוי
  process.on('SIGINT', onExit);
}

module.exports = { enabled, restore, save, startAutoSave, DB_FILE };
