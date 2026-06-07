const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'medical_waste.db');
const db = new sqlite3.Database(dbPath, function(err) {
  if (err) console.error('DB error:', err);
  else { console.log('DB connected'); initDB(); }
});

function initDB() {
  db.serialize(function() {
    db.run("CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)");
    db.run("CREATE TABLE IF NOT EXISTS containers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, max_weight REAL NOT NULL DEFAULT 20, status TEXT DEFAULT 'empty')");
    db.run("CREATE TABLE IF NOT EXISTS transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, department_id INTEGER NOT NULL, container_id INTEGER NOT NULL, waste_type TEXT NOT NULL, package_damaged INTEGER DEFAULT 0, weight REAL, status TEXT DEFAULT 'pending', packed_by TEXT, packed_at TEXT, weighed_by TEXT, weighed_at TEXT, signed_by TEXT, signed_at TEXT, notes TEXT)");
    var depts = ['内科','外科','急诊科','检验科','手术室','放射科'];
    var insD = db.prepare("INSERT OR IGNORE INTO departments (name) VALUES (?)");
    depts.forEach(function(d) { insD.run(d); });
    var conts = [['BOX001',25],['BOX002',25],['BOX003',20],['BOX004',20],['BOX005',30]];
    var insC = db.prepare("INSERT OR IGNORE INTO containers (code, max_weight) VALUES (?, ?)");
    conts.forEach(function(c) { insC.run(c[0], c[1]); });
    console.log('DB initialized');
  });
}

function run(sql, params) {
  params = params || [];
  return new Promise(function(res, rej) {
    db.run(sql, params, function(err) { if (err) rej(err); else res({lastID: this.lastID}); });
  });
}

function get(sql, params) {
  params = params || [];
  return new Promise(function(res, rej) {
    db.get(sql, params, function(err, r) { if (err) rej(err); else res(r); });
  });
}

function all(sql, params) {
  params = params || [];
  return new Promise(function(res, rej) {
    db.all(sql, params, function(err, r) { if (err) rej(err); else res(r); });
  });
}

const app = express();
const PORT = 3000;
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const DETAIL_SQL = "SELECT t.*, d.name as department_name, c.code as container_code, c.max_weight FROM transfers t JOIN departments d ON t.department_id = d.id JOIN containers c ON t.container_id = c.id WHERE t.id = ?";

app.get('/api/departments', async function(req, res) {
  try { res.json({success:true, data: await all("SELECT * FROM departments ORDER BY name")}); }
  catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.get('/api/containers', async function(req, res) {
  try { res.json({success:true, data: await all("SELECT * FROM containers ORDER BY code")}); }
  catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.get('/api/containers/available', async function(req, res) {
  try {
    var sql = "SELECT c.* FROM containers c WHERE c.id NOT IN (SELECT container_id FROM transfers WHERE status IN ('packed','weighed')) OR c.status = 'empty' ORDER BY c.code";
    res.json({success:true, data: await all(sql)});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.get('/api/transfers', async function(req, res) {
  try {
    var sql = "SELECT t.*, d.name as department_name, c.code as container_code, c.max_weight FROM transfers t JOIN departments d ON t.department_id = d.id JOIN containers c ON t.container_id = c.id WHERE 1=1";
    var p = [];
    if (req.query.status) { sql += " AND t.status = ?"; p.push(req.query.status); }
    if (req.query.department_id) { sql += " AND t.department_id = ?"; p.push(req.query.department_id); }
    sql += " ORDER BY t.rowid DESC";
    res.json({success:true, data: await all(sql, p)});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.get('/api/transfers/:id', async function(req, res) {
  try {
    var t = await get(DETAIL_SQL, [req.params.id]);
    if (!t) return res.status(404).json({success:false, message:'Not found'});
    res.json({success:true, data: t});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.post('/api/transfers', async function(req, res) {
  try {
    var b = req.body;
    if (!b.department_id || !b.container_id || !b.waste_type || !b.packed_by)
      return res.status(400).json({success:false, message:'Missing params'});
    var r = await run("INSERT INTO transfers (department_id, container_id, waste_type, package_damaged, packed_by, packed_at, status, notes) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), 'packed', ?)",
      [b.department_id, b.container_id, b.waste_type, b.package_damaged?1:0, b.packed_by, b.notes||null]);
    await run("UPDATE containers SET status = 'in_use' WHERE id = ?", [b.container_id]);
    res.json({success:true, data: await get(DETAIL_SQL, [r.lastID])});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.put('/api/transfers/:id/weigh', async function(req, res) {
  try {
    var b = req.body;
    if (!b.weight || !b.weighed_by) return res.status(400).json({success:false, message:'Missing params'});
    var t = await get("SELECT * FROM transfers WHERE id = ?", [req.params.id]);
    if (!t) return res.status(404).json({success:false, message:'Not found'});
    if (t.status === 'signed') return res.status(400).json({success:false, message:'已签收，交接重量不可修改'});
    if (t.package_damaged === 1) return res.status(400).json({success:false, message:'包装破损，不能交接，请更换包装后重试'});
    var c = await get("SELECT * FROM containers WHERE id = ?", [t.container_id]);
    if (b.weight > c.max_weight) return res.status(400).json({success:false, message:'重量 '+b.weight+'kg 超过周转箱上限 '+c.max_weight+'kg，请拆箱分装'});
    await run("UPDATE transfers SET weight = ?, weighed_by = ?, weighed_at = datetime('now','localtime'), status = 'weighed' WHERE id = ?", [b.weight, b.weighed_by, req.params.id]);
    res.json({success:true, data: await get(DETAIL_SQL, [req.params.id])});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.put('/api/transfers/:id/sign', async function(req, res) {
  try {
    if (!req.body.signed_by) return res.status(400).json({success:false, message:'Missing params'});
    var t = await get("SELECT * FROM transfers WHERE id = ?", [req.params.id]);
    if (!t) return res.status(404).json({success:false, message:'Not found'});
    if (t.status !== 'weighed') return res.status(400).json({success:false, message:'请先完成称重再签收'});
    await run("UPDATE transfers SET signed_by = ?, signed_at = datetime('now','localtime'), status = 'signed' WHERE id = ?", [req.body.signed_by, req.params.id]);
    await run("UPDATE containers SET status = 'in_transit' WHERE id = ?", [t.container_id]);
    res.json({success:true, data: await get(DETAIL_SQL, [req.params.id])});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.get('/api/stats', async function(req, res) {
  try {
    var total = await get("SELECT COUNT(*) as c FROM transfers");
    var pending = await get("SELECT COUNT(*) as c FROM transfers WHERE status = 'packed'");
    var weighed = await get("SELECT COUNT(*) as c FROM transfers WHERE status = 'weighed'");
    var signed = await get("SELECT COUNT(*) as c FROM transfers WHERE status = 'signed'");
    var weight = await get("SELECT COALESCE(SUM(weight),0) as t FROM transfers WHERE status = 'signed'");
    res.json({success:true, data:{total:total.c, pending:pending.c, weighed:weighed.c, signed:signed.c, totalWeight:weight.t}});
  } catch(e) { res.status(500).json({success:false, message:e.message}); }
});

app.listen(PORT, function() { console.log('Server running on http://localhost:'+PORT); });
