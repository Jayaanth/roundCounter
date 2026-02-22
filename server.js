'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS laps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// GET /api/activities - list all activities
app.get('/api/activities', (req, res) => {
  const rows = db.prepare(
    `SELECT a.id, a.name, a.created_at,
            COUNT(l.id) AS lap_count
     FROM activities a
     LEFT JOIN laps l ON l.activity_id = a.id
     GROUP BY a.id
     ORDER BY a.created_at DESC`
  ).all();
  res.json(rows);
});

// POST /api/activities - create activity
app.post('/api/activities', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Activity name is required' });
  }
  try {
    const info = db.prepare(
      `INSERT INTO activities (name, created_at) VALUES (?, datetime('now'))`
    ).run(name);
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(activity);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Activity already exists' });
    }
    throw err;
  }
});

// DELETE /api/activities/:id - delete an activity and its laps
app.delete('/api/activities/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const info = db.prepare('DELETE FROM activities WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.json({ success: true });
});

// POST /api/activities/:id/laps - record a lap
app.post('/api/activities/:id/laps', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  const info = db.prepare(
    `INSERT INTO laps (activity_id, recorded_at) VALUES (?, datetime('now'))`
  ).run(id);
  const lap = db.prepare('SELECT * FROM laps WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(lap);
});

// GET /api/activities/:id/laps - get lap history for an activity
app.get('/api/activities/:id/laps', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  const laps = db.prepare(
    'SELECT * FROM laps WHERE activity_id = ? ORDER BY recorded_at DESC'
  ).all(id);
  res.json({ activity, laps });
});

// DELETE /api/activities/:id/laps/:lapId - delete a single lap
app.delete('/api/activities/:id/laps/:lapId', (req, res) => {
  const lapId = parseInt(req.params.lapId, 10);
  if (!Number.isInteger(lapId)) return res.status(400).json({ error: 'Invalid lapId' });
  const info = db.prepare('DELETE FROM laps WHERE id = ? AND activity_id = ?').run(
    lapId, parseInt(req.params.id, 10)
  );
  if (info.changes === 0) return res.status(404).json({ error: 'Lap not found' });
  res.json({ success: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RoundCounter server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
