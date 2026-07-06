'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireSuper } = require('../auth');
const { logAction } = require('../services/activityLog');

const router = express.Router();
router.use(requireAuth);

// רשימת משפחות — מנהלת-על רואה הכול; אחר רואה רק את שלו
router.get('/', (req, res) => {
  const rows = req.isSuper
    ? db.prepare(`SELECT f.*,
        (SELECT COUNT(*) FROM FamilyMembers m WHERE m.family_id = f.id) AS members,
        (SELECT COUNT(*) FROM Events e WHERE e.family_id = f.id) AS events,
        (SELECT COUNT(*) FROM Users u WHERE u.family_id = f.id) AS users
        FROM Families f ORDER BY f.name`).all()
    : db.prepare('SELECT * FROM Families WHERE id = ?').all(req.familyId);
  res.json(rows);
});

router.post('/', requireSuper, (req, res) => {
  const { name, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'שם המשפחה חובה' });
  const info = db.prepare('INSERT INTO Families (name, notes) VALUES (?,?)').run(name, notes || null);
  logAction(req.user.userId, 'create', 'family', `הוספת משפחה: ${name}`);
  res.status(201).json(db.prepare('SELECT * FROM Families WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireSuper, (req, res) => {
  const ex = db.prepare('SELECT * FROM Families WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  db.prepare('UPDATE Families SET name=?, notes=?, active=? WHERE id=?').run(
    b.name ?? ex.name, b.notes ?? ex.notes,
    b.active !== undefined ? (b.active ? 1 : 0) : ex.active, req.params.id);
  logAction(req.user.userId, 'update', 'family', `עדכון משפחה #${req.params.id}`);
  res.json(db.prepare('SELECT * FROM Families WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireSuper, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM Families').get().c;
  if (count <= 1) return res.status(400).json({ error: 'לא ניתן למחוק את המשפחה האחרונה' });
  // מחיקת נתוני המשפחה
  db.prepare('DELETE FROM FamilyMembers WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM Events WHERE family_id = ?').run(req.params.id);
  db.prepare('DELETE FROM Users WHERE family_id = ? AND role != ?').run(req.params.id, 'superadmin');
  db.prepare('DELETE FROM Families WHERE id = ?').run(req.params.id);
  logAction(req.user.userId, 'delete', 'family', `מחיקת משפחה #${req.params.id} וכל נתוניה`);
  res.json({ ok: true });
});

module.exports = router;
