const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDb(dbPath = './data/followup.db') {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      phone             TEXT NOT NULL,
      consultation_date TEXT NOT NULL,            -- YYYY-MM-DD
      follow_up_date    TEXT NOT NULL,            -- YYYY-MM-DD
      follow_up_status  TEXT NOT NULL DEFAULT 'pending'
                        CHECK (follow_up_status IN ('pending','completed')),
      completed_at      TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_patients_due ON patients(follow_up_status, follow_up_date);

    CREATE TABLE IF NOT EXISTS drafts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      message     TEXT NOT NULL,
      source      TEXT NOT NULL CHECK (source IN ('ai','mock')),
      status      TEXT NOT NULL DEFAULT 'pending_review'
                  CHECK (status IN ('pending_review','approved','rejected')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}
module.exports = { openDb };
