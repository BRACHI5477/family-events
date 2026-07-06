'use strict';

const db = require('../db');

// רישום פעולה בלוג הפעילות (סעיף 18)
function logAction(userId, action, entity, detail) {
  try {
    db.prepare(
      'INSERT INTO ActivityLog (user_id, action, entity, detail) VALUES (?,?,?,?)'
    ).run(userId ?? null, action, entity ?? null, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null));
  } catch (e) {
    // לא מפילים את הבקשה בגלל כשל לוג
    console.error('activityLog error:', e.message);
  }
}

module.exports = { logAction };
