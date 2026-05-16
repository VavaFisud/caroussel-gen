import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const dbPath = process.env.DB_PATH || (process.env.VERCEL ? '/tmp/carousel-gen.sqlite' : './data/carousel-gen.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS carousels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cover_title TEXT,
      account_slug TEXT,
      zip_path TEXT,
      slides_count INTEGER,
      status TEXT DEFAULT 'done',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carousels_generated INTEGER,
      status TEXT,
      error_log TEXT,
      started_at DATETIME,
      finished_at DATETIME
    );
  `);
}

export function createRun() {
  initDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO runs (carousels_generated, status, error_log, started_at)
    VALUES (0, 'running', '', ?)
  `).run(now);
  return result.lastInsertRowid;
}

export function finishRun(id, { carouselsGenerated = 0, status = 'done', errorLog = '' } = {}) {
  initDb();
  db.prepare(`
    UPDATE runs
    SET carousels_generated = ?, status = ?, error_log = ?, finished_at = ?
    WHERE id = ?
  `).run(carouselsGenerated, status, errorLog, new Date().toISOString(), id);
}

export function insertCarousel({ coverTitle, accountSlug, zipPath, slidesCount, status = 'done' }) {
  initDb();
  const result = db.prepare(`
    INSERT INTO carousels (cover_title, account_slug, zip_path, slides_count, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(coverTitle, accountSlug, zipPath, slidesCount, status);
  return result.lastInsertRowid;
}

export function listCarousels(limit = 20) {
  initDb();
  return db.prepare(`
    SELECT id, cover_title, account_slug, zip_path, slides_count, status, created_at
    FROM carousels
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit);
}

export function getCarousel(id) {
  initDb();
  return db.prepare(`
    SELECT id, cover_title, account_slug, zip_path, slides_count, status, created_at
    FROM carousels
    WHERE id = ?
  `).get(id);
}

export function getStatus() {
  initDb();
  const totals = db.prepare('SELECT COUNT(*) AS count FROM carousels').get();
  const lastRun = db.prepare(`
    SELECT id, carousels_generated, status, error_log, started_at, finished_at
    FROM runs
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get();
  const lastCarousel = db.prepare(`
    SELECT id, cover_title, account_slug, created_at
    FROM carousels
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get();

  return {
    carousels_count: totals.count,
    last_run: lastRun || null,
    last_carousel: lastCarousel || null
  };
}

initDb();
