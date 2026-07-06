'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
  const action = req.query.action;
  let sql = `SELECT a.*, u.username FROM ActivityLog a LEFT JOIN Users u ON u.id = a.user_id`;
  const params = [];
  if (action) { sql += ' WHERE a.action = ?'; params.push(action); }
  sql += ' ORDER BY a.id DESC LIMIT ?';
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
