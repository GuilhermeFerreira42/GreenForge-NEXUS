import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function setupTestDatabase() {
  // 1. Isolamento de Banco de Dados: Todo arquivo de teste usa um SQLite efêmero.
  // Utilize process.env.VITEST_WORKER_ID nos hooks de setup/teardown.
  const workerId = process.env.VITEST_WORKER_ID || '0';
  const dbPath = path.join(__dirname, `../test-db-worker-${workerId}.sqlite`);
  
  // Clean up previous database if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
  `);

  return db;
}

export function teardownTestDatabase() {
  const workerId = process.env.VITEST_WORKER_ID || '0';
  const dbPath = path.join(__dirname, `../test-db-worker-${workerId}.sqlite`);
  
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch (err) {
      console.error('Failed to cleanup ephemeral DB:', err);
    }
  }
}
