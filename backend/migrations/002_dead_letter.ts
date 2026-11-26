import type { Migration } from '../src/migrate';

const migration: Migration = {
  id: 2,
  name: '002_dead_letter',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dead_letter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        error TEXT,
        attempts INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS dead_letter;
    `);
  },
};

export default migration;