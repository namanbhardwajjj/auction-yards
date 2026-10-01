/**
 * Database Layer for Auction Yards
 * Uses better-sqlite3 with WAL mode for ultra-fast, concurrent persistent storage
 * of Users, Rooms, Live Auctions, and Season Simulation Results.
 */

const path = require("path");
const fs = require("fs");

let db = null;

try {
  const Database = require("better-sqlite3");
  const dbPath = path.join(__dirname, "data", "auction_yards.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Initialize Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE COLLATE NOCASE,
      salt TEXT,
      passHash TEXT,
      provider TEXT DEFAULT 'password',
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT,
      status TEXT,
      teamCount INTEGER,
      mode TEXT,
      createdBy TEXT,
      createdById TEXT,
      dataJson TEXT,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS tournament_results (
      id TEXT PRIMARY KEY,
      roomId TEXT,
      championId TEXT,
      championName TEXT,
      orangeCap TEXT,
      purpleCap TEXT,
      mvp TEXT,
      dataJson TEXT,
      createdAt INTEGER
    );
  `);

  console.log("SQLite Database initialized at:", dbPath);
} catch (err) {
  console.warn("SQLite not available, falling back to JSON persistence:", err.message);
  db = null;
}

module.exports = {
  db,
  isSqliteAvailable: () => !!db
};
