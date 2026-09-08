const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "logs.db"));

// Init schema
db.exec(`
  CREATE TABLE IF NOT EXISTS check_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT NOT NULL,
    imei       TEXT NOT NULL,
    tac        TEXT,
    brand      TEXT,
    model_name TEXT,
    verdict    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS tac_imports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT,
    rows_added INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

const insertLog = db.prepare(`
  INSERT INTO check_logs (ip, imei, tac, brand, model_name, verdict)
  VALUES (@ip, @imei, @tac, @brand, @model_name, @verdict)
`);

const insertImport = db.prepare(`
  INSERT INTO tac_imports (filename, rows_added) VALUES (@filename, @rows_added)
`);

function logCheck({ ip, imei, tac, brand, model_name, verdict }) {
  insertLog.run({ ip, imei, tac: tac || "", brand: brand || "", model_name: model_name || "", verdict: verdict || "" });
}

function logImport({ filename, rows_added }) {
  insertImport.run({ filename, rows_added });
}

function getLogs({ limit = 100, offset = 0, search = "" } = {}) {
  if (search) {
    return db.prepare(`
      SELECT * FROM check_logs
      WHERE ip LIKE ? OR imei LIKE ? OR brand LIKE ? OR model_name LIKE ?
      ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit, offset);
  }
  return db.prepare(`
    SELECT * FROM check_logs ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getStats() {
  const total      = db.prepare("SELECT COUNT(*) as c FROM check_logs").get().c;
  const today      = db.prepare("SELECT COUNT(*) as c FROM check_logs WHERE date(created_at)=date('now','localtime')").get().c;
  const uniqueIPs  = db.prepare("SELECT COUNT(DISTINCT ip) as c FROM check_logs").get().c;
  const topBrands  = db.prepare("SELECT brand, COUNT(*) as c FROM check_logs WHERE brand!='' GROUP BY brand ORDER BY c DESC LIMIT 5").all();
  const topIPs     = db.prepare("SELECT ip, COUNT(*) as c FROM check_logs GROUP BY ip ORDER BY c DESC LIMIT 10").all();
  const lastImport = db.prepare("SELECT * FROM tac_imports ORDER BY id DESC LIMIT 1").get();
  return { total, today, uniqueIPs, topBrands, topIPs, lastImport };
}

function countLogs(search = "") {
  if (search) {
    return db.prepare(`
      SELECT COUNT(*) as c FROM check_logs
      WHERE ip LIKE ? OR imei LIKE ? OR brand LIKE ? OR model_name LIKE ?
    `).get(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`).c;
  }
  return db.prepare("SELECT COUNT(*) as c FROM check_logs").get().c;
}

module.exports = { logCheck, logImport, getLogs, getStats, countLogs };
