// ============================================================
// store.js — ชั้นข้อมูล (feature toggle จาก environment variable)
//
//   STORAGE=json   (ค่าเริ่มต้น) เก็บไฟล์ data/app-data.json — ไม่ต้องมีอะไรเพิ่ม
//   STORAGE=mysql  เก็บใน MySQL/MariaDB จริง พร้อมกันนั้นต้องตั้ง:
//     MYSQL_HOST, MYSQL_PORT(3306), MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//
// ทุกโหมด "อ่าน" จากหน่วยความจำชุดเดียวกัน (this.db) เพื่อให้ logic ใน server.js
// ใช้ร่วมได้ทั้งคู่ — ต่างกันแค่ "เขียน" ลงไหนตอน persist
// ============================================================
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MODE = (process.env.STORAGE || "json").toLowerCase();
const DATA_FILE = path.join(__dirname, "data", "app-data.json");

const db = { users: [], services: [], slots: [], bookings: [], calls: {}, counters: {}, audit: [] };

// ---------- ค่าเริ่มต้นเมื่อระบบว่าง (ใช้ร่วมทุกโหมด) ----------
function makeUser(username, name, password, role) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { id: crypto.randomUUID(), username, name, role, salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function defaultServices() {
  return [
    { id: "healthcheck", icon: "🩺", name: "ตรวจสุขภาพ", desc: "แพ็กเกจตรวจสุขภาพประจำปี ครอบคลุมตั้งแต่พื้นฐานถึงเชิงลึก รู้ผลภายในวันเดียว", capacity: 6,
      items: [
        { id: "hc-basic", name: "แพ็กเกจพื้นฐาน", price: 990 },
        { id: "hc-plus", name: "แพ็กเกจพิเศษ", price: 2490 },
        { id: "hc-senior", name: "แพ็กเกจผู้สูงอายุ", price: 4990 },
      ] },
    { id: "dental", icon: "🦷", name: "ทันตกรรม", desc: "ตรวจสุขภาพช่องปาก อุดฟัน ขูดหินปูน ฟอกสีฟัน โดยทันตแพทย์", capacity: 3,
      items: [
        { id: "dt-check", name: "ตรวจสุขภาพช่องปาก", price: 300 },
        { id: "dt-scale", name: "ขูดหินปูน", price: 500 },
        { id: "dt-fill", name: "อุดฟัน", price: 800 },
        { id: "dt-whiten", name: "ฟอกสีฟัน", price: 1500 },
      ] },
    { id: "beauty", icon: "✨", name: "คลินิกผิวพรรณ", desc: "ปรึกษาแพทย์ผิวหนัง เลเซอร์ ดูแลผิวหน้า โดยแพทย์เฉพาะทาง", capacity: 2,
      items: [
        { id: "bt-consult", name: "ปรึกษาแพทย์ผิวหนัง", price: 0 },
        { id: "bt-laser", name: "เลเซอร์กำจัดขน", price: 900 },
        { id: "bt-botox", name: "โบท็อกซ์ (เริ่มต้น)", price: 3000 },
        { id: "bt-filler", name: "ฟิลเลอร์ (เริ่มต้น)", price: 5000 },
      ] },
    { id: "vaccine", icon: "💉", name: "วัคซีน", desc: "ฉีดวัคซีนไข้หวัดใหญ่ HPV ตับอักเสบบี พร้อมบันทึกประวัติการฉีด", capacity: 8,
      items: [
        { id: "vx-flu", name: "ไข้หวัดใหญ่ (ต่อเข็ม)", price: 350 },
        { id: "vx-hepb", name: "ตับอักเสบบี (ต่อเข็ม)", price: 200 },
        { id: "vx-hpv", name: "HPV (ต่อเข็ม)", price: 2500 },
      ] },
    { id: "tcm", icon: "🌿", name: "แพทย์แผนจีน", desc: "ฝังเข็ม นวทราพย์ ปรึกษาการดูแลสุขภาพด้วยการแพทย์แผนจีน", capacity: 4,
      items: [
        { id: "tcm-consult", name: "ปรึกษาแพทย์แผนจีน", price: 200 },
        { id: "tcm-needle", name: "ฝังเข็ม", price: 500 },
        { id: "tcm-massage", name: "นวทราพย์", price: 400 },
      ] },
  ];
}
const DEFAULT_SLOTS = ["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00"];

function seedIfEmpty() {
  let seeded = false;
  if (!db.users.length) {
    db.users.push(makeUser("admin", "ผู้ดูแลระบบ", process.env.ADMIN_PASSWORD || "admin", "admin"));
    seeded = true;
  }
  if (!db.services.length) { db.services = defaultServices(); seeded = true; }
  if (!db.slots.length) { db.slots = [...DEFAULT_SLOTS]; seeded = true; }
  return seeded;
}

// ---------- โหมด JSON (ไฟล์เดียว เขียนแบบ atomic) ----------
function jsonSave() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}
const jsonMode = {
  async init() {
    fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
    try { Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); }
    catch { /* ยังไม่มีไฟล์ = ระบบใหม่ */ }
    if (seedIfEmpty()) jsonSave();
    return "json → " + DATA_FILE;
  },
  async addBooking(b) { db.bookings.push(b); jsonSave(); },
  async updateBooking() { jsonSave(); },
  async replaceServices() { jsonSave(); },
  async replaceSlots() { jsonSave(); },
  async markCall(code, iso) { db.calls[code] = iso; jsonSave(); },
  async addAudit(entry) { db.audit.push(entry); if (db.audit.length > 500) db.audit.splice(0, db.audit.length - 500); jsonSave(); },
  async setUserPassword() { jsonSave(); },
  async addUser(u) { db.users.push(u); jsonSave(); },
};

// ---------- โหมด MySQL / MariaDB ----------
let pool = null;
async function q(sql, params) { const [rows] = await pool.execute(sql, params); return rows; }

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL, salt VARCHAR(64) NOT NULL, hash VARCHAR(256) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS services (id VARCHAR(64) PRIMARY KEY, icon VARCHAR(16), name VARCHAR(100) NOT NULL, `desc` VARCHAR(500), active TINYINT DEFAULT 1, capacity INT DEFAULT 4, items JSON, slots JSON, sort INT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS slot_times (id INT AUTO_INCREMENT PRIMARY KEY, t VARCHAR(5) NOT NULL UNIQUE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS bookings (code VARCHAR(20) PRIMARY KEY, qno INT NOT NULL, service_id VARCHAR(64), item_id VARCHAR(64), `date` CHAR(10), `time` VARCHAR(5), name VARCHAR(100), phone VARCHAR(20), rights VARCHAR(60), agency_code VARCHAR(20) NULL, source VARCHAR(10), note VARCHAR(200), status VARCHAR(12), created_at VARCHAR(30), INDEX idx_date (`date`), INDEX idx_service (service_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS counters (`date` CHAR(10), service_id VARCHAR(64), last_qno INT, PRIMARY KEY (`date`, service_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS calls (code VARCHAR(20) PRIMARY KEY, called_at VARCHAR(30)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS audit (id INT AUTO_INCREMENT PRIMARY KEY, at VARCHAR(30), user VARCHAR(50), action VARCHAR(40), detail VARCHAR(300)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

const mysqlMode = {
  async init() {
    const mysql = require("mysql2/promise"); // require เฉพาะเมื่อเปิดใช้โหมดนี้ (โหมด json ไม่ต้องมี node_modules)
    const { MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE)
      throw new Error("STORAGE=mysql ต้องตั้งค่าให้ครบ: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (และ MYSQL_PORT ถ้าไม่ใช่ 3306)");
    const port = Number(process.env.MYSQL_PORT || 3306);
    // สร้าง database ให้เองถ้ายังไม่มี (ต้องต่อแบบไม่ระบุ db ก่อน)
    const setup = await mysql.createConnection({ host: MYSQL_HOST, port, user: MYSQL_USER, password: MYSQL_PASSWORD });
    await setup.query("CREATE DATABASE IF NOT EXISTS `" + MYSQL_DATABASE.replace(/`/g, "") + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await setup.end();
    pool = mysql.createPool({ host: MYSQL_HOST, port, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE, connectionLimit: 4, waitForConnections: true });
    for (const sql of SCHEMA) await q(sql);
    // โหลดทุกตารางเข้าหน่วยความจำ (ขนาดข้อมูลระดับ รพ. โหลดทันทีทั้งก้อนได้สบาย)
    db.users = await q("SELECT id, username, name, role, salt, hash FROM users");
    // mysql2 คืนค่าคอลัมน์ JSON เป็น object แล้ว (ไม่ใช่ string) — รองรับทั้งสองแบบ
    const jsonOf = (v, fallback) => (v == null ? fallback : typeof v === "string" ? JSON.parse(v) : v);
    db.services = (await q("SELECT id, icon, name, `desc`, active, capacity, items, slots FROM services ORDER BY sort"))
      .map((r) => ({ ...r, active: r.active === 0 ? false : undefined, items: jsonOf(r.items, []), slots: jsonOf(r.slots, undefined) }));
    db.slots = (await q("SELECT t FROM slot_times ORDER BY t")).map((r) => r.t);
    db.bookings = (await q("SELECT code, qno, service_id AS serviceId, item_id AS itemId, `date`, `time`, name, phone, rights, agency_code AS agencyCode, source, note, status, created_at AS createdAt FROM bookings ORDER BY `date`, `time`"))
      .map((r) => ({ ...r, agencyCode: r.agencyCode || undefined }));
    db.counters = Object.fromEntries((await q("SELECT `date`, service_id AS serviceId, last_qno FROM counters")).map((r) => [r.date + "|" + r.serviceId, r.last_qno]));
    db.calls = Object.fromEntries((await q("SELECT code, called_at FROM calls")).map((r) => [r.code, r.called_at]));
    db.audit = await q("SELECT at, user, action, detail FROM (SELECT * FROM audit ORDER BY id DESC LIMIT 500) t ORDER BY id");
    if (seedIfEmpty()) { // ระบบใหม่ — เขียนค่าเริ่มต้นลง DB
      for (const u of db.users) await mysqlMode.addUser(u);
      await mysqlMode.replaceServices();
      await mysqlMode.replaceSlots();
    }
    return `mysql → ${MYSQL_HOST}:${port}/${MYSQL_DATABASE} (คิว ${db.bookings.length} รายการ)`;
  },
  async addBooking(b) {
    db.bookings.push(b);
    await q("INSERT INTO bookings (code,qno,service_id,item_id,`date`,`time`,name,phone,rights,agency_code,source,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [b.code, b.qno, b.serviceId, b.itemId, b.date, b.time, b.name, b.phone, b.rights, b.agencyCode || null, b.source, b.note, b.status, b.createdAt]);
    await q("INSERT INTO counters (`date`, service_id, last_qno) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_qno = GREATEST(last_qno, VALUES(last_qno))",
      [b.date, b.serviceId, b.qno]);
  },
  async updateBooking(b) {
    await q("UPDATE bookings SET `date`=?, `time`=?, status=?, name=?, phone=?, rights=?, agency_code=?, note=? WHERE code=?",
      [b.date, b.time, b.status, b.name, b.phone, b.rights, b.agencyCode || null, b.note, b.code]);
  },
  async replaceServices() {
    await q("DELETE FROM services");
    for (let i = 0; i < db.services.length; i++) {
      const s = db.services[i];
      await q("INSERT INTO services (id, icon, name, `desc`, active, capacity, items, slots, sort) VALUES (?,?,?,?,?,?,?,?,?)",
        [s.id, s.icon || "🩺", s.name, s.desc || "", s.active === false ? 0 : 1, s.capacity || 4, JSON.stringify(s.items || []), s.slots ? JSON.stringify(s.slots) : null, i]);
    }
  },
  async replaceSlots() {
    await q("DELETE FROM slot_times");
    for (const t of db.slots) await q("INSERT INTO slot_times (t) VALUES (?)", [t]);
  },
  async markCall(code, iso) {
    db.calls[code] = iso;
    await q("INSERT INTO calls (code, called_at) VALUES (?,?) ON DUPLICATE KEY UPDATE called_at = VALUES(called_at)", [code, iso]);
  },
  async addAudit(entry) {
    db.audit.push(entry);
    if (db.audit.length > 500) db.audit.splice(0, db.audit.length - 500);
    await q("INSERT INTO audit (at, user, action, detail) VALUES (?,?,?,?)", [entry.at, entry.user, entry.action, entry.detail]);
  },
  async setUserPassword(u) {
    await q("UPDATE users SET salt=?, hash=? WHERE id=?", [u.salt, u.hash, u.id]);
  },
  async addUser(u) {
    await q("INSERT INTO users (id, username, name, role, salt, hash) VALUES (?,?,?,?,?,?)", [u.id, u.username, u.name, u.role, u.salt, u.hash]);
  },
};

const impl = MODE === "mysql" ? mysqlMode : jsonMode;
module.exports = { mode: MODE, db, makeUser, ...impl, init: () => impl.init() };
