const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'medical_waste.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      max_weight REAL NOT NULL DEFAULT 20,
      status TEXT DEFAULT 'empty',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      container_id INTEGER NOT NULL,
      waste_type TEXT NOT NULL,
      package_damaged INTEGER DEFAULT 0,
      weight REAL,
      status TEXT DEFAULT 'pending',
      packed_by TEXT,
      packed_at TEXT,
      weighed_by TEXT,
      weighed_at TEXT,
      signed_by TEXT,
      signed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (container_id) REFERENCES containers(id)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_transfers_department ON transfers(department_id)');

  const departments = ['内科', '外科', '急诊科', '检验科', '手术室', '放射科'];
  const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
  departments.forEach(dept => insertDept.run(dept));

  const containers = [
    ['BOX001', 25],
    ['BOX002', 25],
    ['BOX003', 20],
    ['BOX004', 20],
    ['BOX005', 30],
  ];
  const insertContainer = db.prepare('INSERT OR IGNORE INTO containers (code, max_weight) VALUES (?, ?)');
  containers.forEach(([code, max]) => insertContainer.run(code, max));

  console.log('数据库初始化完成！');
  console.log('已创建表：departments, containers, transfers');
  console.log('初始科室：', departments.join(', '));
  console.log('初始周转箱：', containers.map(c => c[0]).join(', '));

  db.close();
});
