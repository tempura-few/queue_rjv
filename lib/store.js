// ============================================================
// lib/store.js — ชั้นข้อมูล (feature toggle จาก environment variable)
//
//   STORAGE=json   (ค่าเริ่มต้น) เก็บไฟล์ data/app-data.json — ไม่ต้องมีอะไรเพิ่ม
//   STORAGE=mysql  เก็บใน MySQL/MariaDB จริง พร้อมกันนั้นต้องตั้ง:
//     MYSQL_HOST, MYSQL_PORT(3306), MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//
// ทุกโหมด "อ่าน" จากหน่วยความจำชุดเดียวกัน (this.db) เพื่อให้ logic ใน lib/core.js
// ใช้ร่วมได้ทั้งคู่ — ต่างกันแค่ "เขียน" ลงไหนตอน persist
// (พอร์ตมาจาก store.js ยุค Pure-Node — เปลี่ยนแค่ตำแหน่งไฟล์ข้อมูลจาก __dirname
//  เป็น process.cwd() เพราะ Next.js ไม่มี __dirname ตอนรัน)
// ============================================================
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { bannerFor, itemBanner } = require("./banner.js"); // รูปแบนเนอร์เริ่มต้นของบริการ/รายการย่อย (SVG base64)

const MODE = (process.env.STORAGE || "json").toLowerCase();
const DATA_FILE = path.join(process.cwd(), "data", "app-data.json");
// PDPA: audit log เก็บไว้ตรวจสอบย้อนหลังมากขึ้น (เดิม 500 สั้นเกินไปสำหรับประวัติการเข้าถึงข้อมูล)
const AUDIT_CAP = 5000;

const db = { users: [], services: [], slots: [], bookings: [], calls: {}, counters: {}, audit: [], settings: {}, agencies: [] };

// ยุคก่อน role มี "counter" — ปรับเป็น "cs" (ฝ่ายบริการลูกค้า) ให้ครั้งเดียวตอนโหลด
// คืน true เมื่อมีการแก้ (ผู้เรียกต้อง persist ต่อ)
function migrateLegacyRoles() {
  let changed = false;
  for (const u of db.users) if (u.role === "counter") { u.role = "cs"; changed = true; }
  return changed;
}

// ---------- ค่าเริ่มต้นเมื่อระบบว่าง (ใช้ร่วมทุกโหมด) ----------
function makeUser(username, name, password, role, agencyCode) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { id: crypto.randomUUID(), username, name, role, agencyCode: role === "agency" ? (agencyCode || undefined) : undefined, salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function defaultServices() {
  return [
    { id: "healthcheck", icon: "🩺", name: "ตรวจสุขภาพ", category: "ตรวจสุขภาพ", image: bannerFor("healthcheck"), desc: "แพ็กเกจตรวจสุขภาพประจำปี ครอบคลุมตั้งแต่พื้นฐานถึงเชิงลึก รู้ผลภายในวันเดียว", capacity: 6,
      items: [
        { id: "hc-basic", name: "แพ็กเกจพื้นฐาน", image: itemBanner("healthcheck", "แพ็กเกจพื้นฐาน"), detail: "ตรวจเลือด 10 รายการ · เอกซเรย์ปอด · ตรวจปัสสาวะ · ตรวจร่างกายโดยแพทย์\nงดอาหาร 8 ชม. ก่อนตรวจ · รู้ผลภายใน 1 วัน", detailEn: "10 blood tests · Chest X-ray · Urine test · Physical examination\nFast 8 hrs before check-up · Results within 1 day", price: 990 },
        { id: "hc-plus", name: "แพ็กเกจพิเศษ", image: itemBanner("healthcheck", "แพ็กเกจพิเศษ"), detail: "ตรวจเลือด 20 รายการ · เอกซเรย์ปอด · อัลตราซาวด์ช่องท้อง · ตรวจคลื่นไฟฟ้าหัวใจ\nงดอาหาร 8 ชม. ก่อนตรวจ · รู้ผลภายใน 1 วัน", detailEn: "20 blood tests · Chest X-ray · Abdominal ultrasound · ECG\nFast 8 hrs before check-up · Results within 1 day", price: 2490 },
        { id: "hc-senior", name: "แพ็กเกจผู้สูงอายุ", image: itemBanner("healthcheck", "แพ็กเกจผู้สูงอายุ"), detail: "ตรวจเลือด 26 รายการ · ตรวจคัดกรองมะเร็ง · ตรวจหัวใจ · วัดความหนาแน่นกระดูก\nเหมาะสำหรับผู้สูงอายุ 50 ปีขึ้นไป · แพทย์สรุปผลให้", detailEn: "26 blood tests · Cancer screening · Heart check · Bone density scan\nFor ages 50+ · Physician review included", price: 4990 },
      ] },
    { id: "dental", icon: "🦷", name: "ทันตกรรม", category: "ทันตกรรม", image: bannerFor("dental"), desc: "ตรวจสุขภาพช่องปาก อุดฟัน ขูดหินปูน ฟอกสีฟัน โดยทันตแพทย์", capacity: 3,
      items: [
        { id: "dt-check", name: "ตรวจสุขภาพช่องปาก", image: itemBanner("dental", "ตรวจสุขภาพช่องปาก"), price: 300 },
        { id: "dt-scale", name: "ขูดหินปูน", image: itemBanner("dental", "ขูดหินปูน"), price: 500 },
        { id: "dt-fill", name: "อุดฟัน", image: itemBanner("dental", "อุดฟัน"), price: 800 },
        { id: "dt-whiten", name: "ฟอกสีฟัน", image: itemBanner("dental", "ฟอกสีฟัน"), price: 1500 },
      ] },
    { id: "beauty", icon: "✨", name: "คลินิกผิวพรรณ", category: "ความงาม", image: bannerFor("beauty"), desc: "ปรึกษาแพทย์ผิวหนัง เลเซอร์ ดูแลผิวหน้า โดยแพทย์เฉพาะทาง", capacity: 2,
      items: [
        { id: "bt-consult", name: "ปรึกษาแพทย์ผิวหนัง", image: itemBanner("beauty", "ปรึกษาแพทย์ผิวหนัง"), price: 0 },
        { id: "bt-laser", name: "เลเซอร์กำจัดขน", image: itemBanner("beauty", "เลเซอร์กำจัดขน"), price: 900 },
        { id: "bt-botox", name: "โบท็อกซ์ (เริ่มต้น)", image: itemBanner("beauty", "โบท็อกซ์"), price: 3000 },
        { id: "bt-filler", name: "ฟิลเลอร์ (เริ่มต้น)", image: itemBanner("beauty", "ฟิลเลอร์"), price: 5000 },
      ] },
    { id: "vaccine", icon: "💉", name: "วัคซีน", category: "วัคซีน", image: bannerFor("vaccine"), desc: "ฉีดวัคซีนไข้หวัดใหญ่ HPV ตับอักเสบบี พร้อมบันทึกประวัติการฉีด", capacity: 8,
      items: [
        { id: "vx-flu", name: "ไข้หวัดใหญ่ (ต่อเข็ม)", image: itemBanner("vaccine", "ไข้หวัดใหญ่"), price: 350 },
        { id: "vx-hepb", name: "ตับอักเสบบี (ต่อเข็ม)", image: itemBanner("vaccine", "ตับอักเสบบี"), price: 200 },
        { id: "vx-hpv", name: "HPV (ต่อเข็ม)", image: itemBanner("vaccine", "HPV"), price: 2500 },
      ] },
    { id: "tcm", icon: "🌿", name: "แพทย์แผนจีน", category: "แพทย์ทางเลือก", image: bannerFor("tcm"), desc: "ฝังเข็ม นวทราพย์ ปรึกษาการดูแลสุขภาพด้วยการแพทย์แผนจีน", capacity: 4,
      items: [
        { id: "tcm-consult", name: "ปรึกษาแพทย์แผนจีน", image: itemBanner("tcm", "ปรึกษาแพทย์แผนจีน"), price: 200 },
        { id: "tcm-needle", name: "ฝังเข็ม", image: itemBanner("tcm", "ฝังเข็ม"), price: 500 },
        { id: "tcm-massage", name: "นวทราพย์", image: itemBanner("tcm", "นวทราพย์"), price: 400 },
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
function ensureSettings() { // ค่าตั้งที่แก้ได้จากหลังบ้าน — คืน true เมื่อยังไม่มีและต้องเขียนค่าเริ่มต้นลง DB
  if (Number(db.settings.daysAhead) >= 1) return false;
  db.settings = { daysAhead: 14 };
  return true;
}

// ---------- โหมด JSON (ไฟล์เดียว เขียนแบบ atomic) ----------
// PDPA (data at rest): ถ้าตั้ง DATA_KEY ทั้งไฟล์จะถูกเข้ารหัส AES-256-GCM —
// ขโมยไฟล์/แบ็กอัปไปก็อ่านไม่ได้ (หน่วยความจำยังเป็น plaintext เพื่อให้ค้นหา/จัดคิวทำงานปกติ)
// รูปแบบไฟล์: "QENC1:" + base64(iv 12B + authTag 16B + ciphertext) — IV สุ่มใหม่ทุกครั้งที่บันทึก
// DATA_KEY รับทั้ง hex 64 ตัว (32 ไบต์ตรง ๆ จาก openssl rand -hex 32) และ passphrase ทั่วไป (derive ด้วย scrypt)
const ENC_MAGIC = "QENC1:";
const DATA_KEY = String(process.env.DATA_KEY || "").trim();
function dataKey() {
  if (!DATA_KEY) return null;
  if (/^[0-9a-fA-F]{64}$/.test(DATA_KEY)) return Buffer.from(DATA_KEY, "hex");
  return crypto.scryptSync(DATA_KEY, "queue-rjv-file-key-v1", 32);
}
const encKey = dataKey();
function encryptPayload(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey, iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ENC_MAGIC + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function decryptPayload(raw) {
  if (!raw.startsWith(ENC_MAGIC)) return raw; // ไฟล์ plaintext เดิม — อ่านได้ (จะเข้ารหัสให้ตอนบันทึกครั้งถัดไป)
  if (!encKey) throw new Error("[store] ไฟล์ข้อมูลถูกเข้ารหัสไว้ แต่ไม่ได้ตั้ง DATA_KEY ใน environment — ถอดรหัสไม่ได้");
  let buf;
  try { buf = Buffer.from(raw.slice(ENC_MAGIC.length), "base64"); } catch { throw new Error("[store] ไฟล์ข้อมูลเข้ารหัสเสียหาย (base64 อ่านไม่ได้)"); }
  if (buf.length < 29) throw new Error("[store] ไฟล์ข้อมูลเข้ารหัสเสียหาย (สั้นเกินไป)");
  const d = crypto.createDecipheriv("aes-256-gcm", encKey, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  try { return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"); }
  catch { throw new Error("[store] ถอดรหัสไฟล์ข้อมูลไม่สำเร็จ — DATA_KEY ไม่ตรงกับตอนที่เข้ารหัส หรือไฟล์ถูกแก้ไข"); }
}
function jsonSave() {
  const tmp = DATA_FILE + ".tmp";
  const plain = JSON.stringify(db, null, 1);
  fs.writeFileSync(tmp, encKey ? encryptPayload(plain) : plain);
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- PDPA: เข้ารหัส "รายฟิลด์" สำหรับโหมด MySQL/MariaDB ----------
// ทำไมทำได้โปร่งใส: แอปโหลดทั้งฐานข้อมูลเข้าหน่วยความจำครั้งเดียวตอน init แล้วค้นหา/กรอง
// ใน memory ทั้งหมด — จึงเข้ารหัสเฉพาะ "ตอนเขียนลง SQL" และถอดรหัส "ตอนโหลด" โดยไม่กระทบ
// ฟีเจอร์ค้นหาชื่อ/เบอร์/อีเมลเลย · คีย์ derive จาก DATA_KEY คนละ salt กับคีย์ไฟล์ JSON
// ฟิลด์ที่เข้ารหัส: bookings(name, phone, email, note) · users(name) · agencies(contact) · audit(detail)
// คอลัมน์ที่ไม่เข้ารหัส: code/date/time/status/qno/username/salt/hash — ต้องใช้ query/join/index
const FIELD_MAGIC = "enc:v1:";
function deriveFieldKey() {
  const dk = String(process.env.DATA_KEY || "").trim();
  if (!dk) return null;
  if (/^[0-9a-fA-F]{64}$/.test(dk)) return crypto.scryptSync(Buffer.from(dk, "hex"), "queue-rjv-field-key-v1", 32);
  return crypto.scryptSync(dk, "queue-rjv-field-key-v1", 32);
}
const fKey = deriveFieldKey();
function fieldEnc(v) {
  if (!fKey || v == null) return v;
  const s = String(v); // แปลงก่อนเช็กค่าว่าง — คอลัมน์ VARBINARY อาจมาเป็น Buffer("") ซึ่ง !== ""
  if (s === "") return "";
  if (s.startsWith(FIELD_MAGIC)) return s; // เข้ารหัสอยู่แล้ว — เก็บตามเดิม
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", fKey, iv);
  const ct = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return FIELD_MAGIC + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function fieldDec(v) {
  if (v == null) return v;
  const s = Buffer.isBuffer(v) ? v.toString("utf8") : String(v); // VARBINARY → Buffer
  if (!s.startsWith(FIELD_MAGIC)) return s; // plaintext เก่า (ก่อนเปิด DATA_KEY) — อ่านได้ตามเดิม
  if (!fKey) throw new Error("[store] ข้อมูลในฐานข้อมูลเข้ารหัสไว้ แต่ไม่ได้ตั้ง DATA_KEY — ถอดรหัสไม่ได้");
  let buf;
  try { buf = Buffer.from(s.slice(FIELD_MAGIC.length), "base64"); } catch { throw new Error("[store] ข้อมูลเข้ารหัสในฐานข้อมูลเสียหาย (base64 อ่านไม่ได้)"); }
  if (buf.length < 28) throw new Error("[store] ข้อมูลเข้ารหัสในฐานข้อมูลเสียหาย (สั้นเกินไป)");
  const d = crypto.createDecipheriv("aes-256-gcm", fKey, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  try { return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"); } // buf 28 = plaintext ว่าง
  catch { throw new Error("[store] ถอดรหัสข้อมูลในฐานข้อมูลไม่สำเร็จ — DATA_KEY ไม่ตรงกับตอนที่เข้ารหัส"); }
}
// ตรวจว่าค่าที่อ่านมา "เข้ารหัสแล้ว" (ค่าว่างนับเป็นผ่าน — ไม่มีอะไรให้เข้ารหัส)
const isEnc = (v) => v == null || v === "" || (Buffer.isBuffer(v) ? v.toString("utf8") : String(v)).startsWith(FIELD_MAGIC);
const jsonMode = {
  async init() {
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    let wasEncrypted = false;
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      wasEncrypted = raw.startsWith(ENC_MAGIC);
      Object.assign(db, JSON.parse(decryptPayload(raw)));
    } catch (e) {
      if (String(e.message).startsWith("[store]")) throw e; // ไฟล์เข้ารหัสแต่ถอดไม่ได้ = ต้องหยุด ไม่ใช่เริ่มระบบว่างทับของเดิม
      /* ยังไม่มีไฟล์ = ระบบใหม่ */
    }
    const legacyRoles = migrateLegacyRoles();
    let seeded = seedIfEmpty();
    if (ensureSettings()) seeded = true;
    // เพิ่งตั้ง DATA_KEY กับไฟล์ plaintext เดิม → เข้ารหัสทับทันที (migration ฝั่งเดียว: ถอดคืนต้องแก้ไฟล์เอง)
    if (seeded || legacyRoles || (encKey && !wasEncrypted)) jsonSave();
    if (!encKey && process.env.NODE_ENV === "production")
      console.warn("[store] ⚠️ PDPA: STORAGE=json ใน production โดยไม่ตั้ง DATA_KEY — ไฟล์ข้อมูล/แบ็กอัปเป็น plaintext ควรตั้ง DATA_KEY (openssl rand -hex 32)");
    return "json → " + DATA_FILE + (encKey ? " (เข้ารหัส AES-256-GCM)" : "");
  },
  async addBooking(b) { db.bookings.push(b); jsonSave(); },
  async updateBooking() { jsonSave(); },
  async replaceServices() { jsonSave(); },
  async replaceSlots() { jsonSave(); },
  async replaceAgencies() { jsonSave(); },
  async saveSettings() { jsonSave(); },
  async markCall(code, iso) { db.calls[code] = iso; jsonSave(); },
  async addAudit(entry) { db.audit.push(entry); if (db.audit.length > AUDIT_CAP) db.audit.splice(0, db.audit.length - AUDIT_CAP); jsonSave(); },
  async setUserPassword() { jsonSave(); },
  async addUser(u) { db.users.push(u); jsonSave(); },
  async updateUser() { jsonSave(); }, // ผู้เรียกแก้ object ใน db.users แล้ว (ชื่อ/สิทธิ์/รหัสผ่าน)
  async deleteUser(id) { db.users = db.users.filter((u) => u.id !== id); jsonSave(); },
  // PDPA (retention): ลบคิวเก่าเกินกำหนด — คิวมีวันนัดใช้ `date` / คำขอรอนัดหมาย (date ว่าง) ใช้ `createdAt`
  async purgeOldBookings(cutoffDate, cutoffIso) {
    const old = db.bookings.filter((b) => (b.date ? b.date < cutoffDate : String(b.createdAt || "") < cutoffIso));
    if (!old.length) return 0;
    const codes = new Set(old.map((b) => b.code));
    db.bookings = db.bookings.filter((b) => !codes.has(b.code));
    for (const c of codes) delete db.calls[c];
    jsonSave();
    return old.length;
  },
  async purgeOldAudit(cutoffIso) {
    const before = db.audit.length;
    db.audit = db.audit.filter((e) => String(e.at || "") >= cutoffIso);
    const removed = before - db.audit.length;
    if (removed) jsonSave();
    return removed;
  },
};

// ---------- โหมด MySQL / MariaDB ----------
let pool = null;
async function q(sql, params) { const [rows] = await pool.execute(sql, params); return rows; }

const SCHEMA = [
  // ฟิลด์ PII (name/phone/email/note/contact/detail) เป็น VARBINARY เพื่อเก็บ ciphertext ของ field encryption (ดู FIELD_MAGIC)
  "CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, name VARBINARY(1024) NOT NULL, role VARCHAR(20) NOT NULL, agency_code VARCHAR(20) NULL, salt VARCHAR(64) NOT NULL, hash VARCHAR(256) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS services (id VARCHAR(64) PRIMARY KEY, icon VARCHAR(16), name VARCHAR(100) NOT NULL, name_en VARCHAR(100), `desc` VARCHAR(500), desc_en VARCHAR(500), active TINYINT DEFAULT 1, capacity INT DEFAULT 4, items JSON, slots JSON, slots_by_day JSON NULL, days JSON, sort INT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS slot_times (id INT AUTO_INCREMENT PRIMARY KEY, t VARCHAR(5) NOT NULL UNIQUE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS agencies (id VARCHAR(64) PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL, contact VARBINARY(1024) NULL, active TINYINT DEFAULT 1, sort INT DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS settings (k VARCHAR(50) PRIMARY KEY, v VARCHAR(200)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS bookings (code VARCHAR(20) PRIMARY KEY, qno INT NOT NULL, service_id VARCHAR(64), item_id VARCHAR(64), `date` CHAR(10), `time` VARCHAR(5), name VARBINARY(1024), phone VARBINARY(256), email VARBINARY(1024) NULL, rights VARCHAR(60), agency_code VARCHAR(20) NULL, source VARCHAR(10), note VARBINARY(2048), status VARCHAR(12), created_at VARCHAR(30), INDEX idx_date (`date`), INDEX idx_service (service_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS counters (`date` CHAR(10), service_id VARCHAR(64), last_qno INT, PRIMARY KEY (`date`, service_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS calls (code VARCHAR(20) PRIMARY KEY, called_at VARCHAR(30)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS audit (id INT AUTO_INCREMENT PRIMARY KEY, at VARCHAR(30), user VARCHAR(50), action VARCHAR(40), detail VARBINARY(2048)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

const mysqlMode = {
  async init() {
    const mysql = require("mysql2/promise"); // require เฉพาะเมื่อเปิดใช้โหมดนี้ (โหมด json ไม่ต้องมี)
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
    // migration เพิ่มคอลัมน์/ปรับชนิด — ทำซ้ำได้: พอทำแล้ว ALTER จะ error จึง catch ไว้เฉย ๆ
    for (const sql of [
      "ALTER TABLE bookings ADD COLUMN channel VARCHAR(60) NULL",
      "ALTER TABLE settings MODIFY v TEXT",
    ]) { try { await q(sql); } catch {} }
    // migration เล็ก ๆ: เพิ่มคอลัมน์ประเภทบริการ (slot/callback), วันให้บริการ และชื่อ/คำอธิบายภาษาอังกฤษ — ติดตั้งเดิมยังไม่มี
    try { await q("ALTER TABLE services ADD COLUMN booking_mode VARCHAR(10) NOT NULL DEFAULT 'slot'"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE services ADD COLUMN days JSON NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE services ADD COLUMN name_en VARCHAR(100) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE services ADD COLUMN desc_en VARCHAR(500) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE bookings ADD COLUMN email VARCHAR(120) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE services ADD COLUMN slots_by_day JSON NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE users ADD COLUMN agency_code VARCHAR(20) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    // PDPA: บันทึกความยินยอม (consent_at/consent_via) และร่องรอยการลบข้อมูลตามคำขอ (erased_at/erased_by)
    try { await q("ALTER TABLE bookings ADD COLUMN consent_at VARCHAR(30) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE bookings ADD COLUMN consent_via VARCHAR(10) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE bookings ADD COLUMN erased_at VARCHAR(30) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    try { await q("ALTER TABLE bookings ADD COLUMN erased_by VARCHAR(50) NULL"); } catch (e) { /* มีคอลัมน์อยู่แล้ว */ }
    // PDPA (field encryption): ขยายคอลัมน์ PII เป็น VARBINARY ให้พอใส่ ciphertext —
    // ข้อมูล VARCHAR เดิมถูกแปลงเป็นไบต์ UTF-8 ตามเดิม (อ่านเป็น plaintext ได้ต่อ แล้วค่อยเข้ารหัสตอน migrate ด้านล่าง)
    for (const sql of [
      "ALTER TABLE bookings MODIFY name VARBINARY(1024) NULL",
      "ALTER TABLE bookings MODIFY phone VARBINARY(256) NULL",
      "ALTER TABLE bookings MODIFY email VARBINARY(1024) NULL",
      "ALTER TABLE bookings MODIFY note VARBINARY(2048) NULL",
      "ALTER TABLE users MODIFY name VARBINARY(1024) NOT NULL",
      "ALTER TABLE agencies MODIFY contact VARBINARY(1024) NULL",
      "ALTER TABLE audit MODIFY detail VARBINARY(2048) NULL",
    ]) { try { await q(sql); } catch (e) { /* ชนิดตรงอยู่แล้ว */ } }
    // โหลดทุกตารางเข้าหน่วยความจำ (ขนาดข้อมูลระดับ รพ. โหลดทันทีทั้งก้อนได้สบาย)
    // ฟิลด์ PII ถอดรหัสด้วย fieldDec — แถวที่ยังเป็น plaintext (ก่อนเปิด DATA_KEY) ถูกนับไว้เพื่อ migrate ด้านล่าง
    const plainRows = { users: [], agencies: [], bookings: [], audit: [] };
    db.users = (await q("SELECT id, username, name, role, agency_code AS agencyCode, salt, hash FROM users")).map((r) => {
      if (!isEnc(r.name)) plainRows.users.push(r.id);
      return { ...r, name: fieldDec(r.name) };
    });
    if (migrateLegacyRoles()) await q("UPDATE users SET role='cs' WHERE role='counter'");
    // mysql2 คืนค่าคอลัมน์ JSON เป็น object แล้ว (ไม่ใช่ string) — รองรับทั้งสองแบบ
    const jsonOf = (v, fallback) => (v == null ? fallback : typeof v === "string" ? JSON.parse(v) : v);
    db.services = (await q("SELECT id, icon, name, name_en AS nameEn, `desc`, desc_en AS descEn, active, capacity, items, slots, slots_by_day AS slotsByDay, days, booking_mode AS bookingMode FROM services ORDER BY sort"))
      .map((r) => ({ ...r, active: r.active === 0 ? false : undefined, items: jsonOf(r.items, []), slots: jsonOf(r.slots, undefined), slotsByDay: jsonOf(r.slotsByDay, undefined), days: jsonOf(r.days, undefined), nameEn: r.nameEn || undefined, descEn: r.descEn || undefined }));
    db.slots = (await q("SELECT t FROM slot_times ORDER BY t")).map((r) => r.t);
    db.agencies = (await q("SELECT id, code, name, contact, active, sort FROM agencies ORDER BY sort, code"))
      .map((r) => { if (!isEnc(r.contact)) plainRows.agencies.push(r.id); return { ...r, contact: fieldDec(r.contact) || undefined, active: r.active === 0 ? false : undefined }; });
    db.bookings = (await q("SELECT code, qno, service_id AS serviceId, item_id AS itemId, `date`, `time`, name, phone, email, rights, agency_code AS agencyCode, source, channel, note, status, created_at AS createdAt, consent_at AS consentAt, consent_via AS consentVia, erased_at AS erasedAt, erased_by AS erasedBy FROM bookings ORDER BY `date`, `time`"))
      .map((r) => {
        if (!isEnc(r.name) || !isEnc(r.phone) || !isEnc(r.email) || !isEnc(r.note)) plainRows.bookings.push(r.code);
        return { ...r, name: fieldDec(r.name), phone: fieldDec(r.phone), email: fieldDec(r.email) || undefined, note: fieldDec(r.note),
          agencyCode: r.agencyCode || undefined,
          consentAt: r.consentAt || undefined, consentVia: r.consentVia || undefined, erasedAt: r.erasedAt || undefined, erasedBy: r.erasedBy || undefined };
      });
    db.counters = Object.fromEntries((await q("SELECT `date`, service_id AS serviceId, last_qno FROM counters")).map((r) => [r.date + "|" + r.serviceId, r.last_qno]));
    db.calls = Object.fromEntries((await q("SELECT code, called_at FROM calls")).map((r) => [r.code, r.called_at]));
    db.audit = (await q("SELECT id, at, user, action, detail FROM (SELECT * FROM audit ORDER BY id DESC LIMIT 5000) t ORDER BY id")) // PDPA: เก็บประวัติการเข้าถึงย้อนหลังให้พอตรวจสอบได้ (5,000 รายการล่าสุด)
      .map((r) => { if (!isEnc(r.detail)) plainRows.audit.push({ id: r.id, detail: r.detail }); return { at: r.at, user: r.user, action: r.action, detail: fieldDec(r.detail) }; });
    // ค่าตั้งบางชนิดเป็นอาร์เรย์/ออบเจ็กต์ (rights, channels) — เก็บเป็น JSON แล้วแตกกลับตอนโหลด
    const parseSettingVal = (v) => {
      if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
      if (v && (v.startsWith("[") || v.startsWith("{"))) { try { return JSON.parse(v); } catch {} }
      return v;
    };
    db.settings = Object.fromEntries((await q("SELECT k, v FROM settings")).map((r) => [r.k, parseSettingVal(r.v)]));
    if (seedIfEmpty()) { // ระบบใหม่ — เขียนค่าเริ่มต้นลง DB
      for (const u of db.users) await mysqlMode.insertUserRow(u);
      await mysqlMode.replaceServices();
      await mysqlMode.replaceSlots();
    }
    if (ensureSettings()) await mysqlMode.saveSettings();
    // PDPA: เปิด DATA_KEY ครั้งแรกกับฐานข้อมูลเดิม — เข้ารหัสข้อมูล plaintext ทั้งก้อนทีเดียว (migration อัตโนมัติ รันซ้ำได้)
    if (fKey) {
      let n = 0;
      for (const id of plainRows.users) { const u = db.users.find((x) => x.id === id); if (u) { await q("UPDATE users SET name=? WHERE id=?", [fieldEnc(u.name), id]); n++; } }
      for (const id of plainRows.agencies) { const a = db.agencies.find((x) => x.id === id); if (a && a.contact) { await q("UPDATE agencies SET contact=? WHERE id=?", [fieldEnc(a.contact), id]); n++; } }
      for (const code of plainRows.bookings) {
        const b = db.bookings.find((x) => x.code === code);
        if (b) { await q("UPDATE bookings SET name=?, phone=?, email=?, note=? WHERE code=?", [fieldEnc(b.name ?? ""), fieldEnc(b.phone ?? ""), b.email ? fieldEnc(b.email) : null, fieldEnc(b.note ?? ""), code]); n++; }
      }
      for (const r of plainRows.audit) { await q("UPDATE audit SET detail=? WHERE id=?", [fieldEnc(r.detail ?? ""), r.id]); n++; }
      if (n) console.log(`[store] PDPA: เข้ารหัสข้อมูลเดิมในฐานข้อมูลแล้ว ${n} รายการ (DATA_KEY)`);
    } else if (process.env.NODE_ENV === "production") {
      console.warn("[store] ⚠️ PDPA: STORAGE=mysql โดยไม่ตั้ง DATA_KEY — ชื่อ/เบอร์/อีเมลผู้ป่วยในฐานข้อมูลเป็น plaintext ควรตั้ง DATA_KEY (openssl rand -hex 32) แล้ว restart ระบบจะเข้ารหัสข้อมูลเดิมให้อัตโนมัติ");
    }
    return `mysql → ${MYSQL_HOST}:${port}/${MYSQL_DATABASE} (คิว ${db.bookings.length} รายการ` + (fKey ? ", PII เข้ารหัสรายฟิลด์" : ", PII ยังไม่เข้ารหัส — ไม่มี DATA_KEY") + ")";
  },
  // เขียนแถวผู้ใช้ลงตารางเท่านั้น (ไม่แตะหน่วยความจำ) — ใช้ตอน init seed ที่ข้อมูลอยู่ใน db.users แล้ว
  async insertUserRow(u) {
    await q("INSERT INTO users (id, username, name, role, agency_code, salt, hash) VALUES (?,?,?,?,?,?,?)", [u.id, u.username, fieldEnc(u.name), u.role, u.agencyCode || null, u.salt, u.hash]);
  },
  async addBooking(b) {
    db.bookings.push(b);
    await q("INSERT INTO bookings (code,qno,service_id,item_id,`date`,`time`,name,phone,email,rights,agency_code,source,channel,note,status,created_at,consent_at,consent_via) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [b.code, b.qno, b.serviceId, b.itemId ?? null, b.date, b.time, fieldEnc(b.name), fieldEnc(b.phone), b.email ? fieldEnc(b.email) : null, b.rights, b.agencyCode || null, b.source, b.channel || null, fieldEnc(b.note), b.status, b.createdAt, b.consentAt || null, b.consentVia || null]);
    await q("INSERT INTO counters (`date`, service_id, last_qno) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_qno = GREATEST(last_qno, VALUES(last_qno))",
      [b.date, b.serviceId, b.qno]);
  },
  async updateBooking(b) {
    await q("UPDATE bookings SET `date`=?, `time`=?, status=?, name=?, phone=?, email=?, rights=?, agency_code=?, channel=?, note=?, erased_at=?, erased_by=? WHERE code=?",
      [b.date, b.time, b.status, fieldEnc(b.name), fieldEnc(b.phone ?? ""), b.email ? fieldEnc(b.email) : null, b.rights, b.agencyCode || null, b.channel || null, fieldEnc(b.note ?? ""), b.erasedAt || null, b.erasedBy || null, b.code]);
  },
  async replaceServices() {
    await q("DELETE FROM services");
    for (let i = 0; i < db.services.length; i++) {
      const s = db.services[i];
      await q("INSERT INTO services (id, icon, name, name_en, `desc`, desc_en, active, capacity, items, slots, slots_by_day, days, sort, booking_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [s.id, s.icon || "🩺", s.name, s.nameEn || null, s.desc || "", s.descEn || null, s.active === false ? 0 : 1, s.capacity || 4, JSON.stringify(s.items || []), s.slots ? JSON.stringify(s.slots) : null, s.slotsByDay ? JSON.stringify(s.slotsByDay) : null, Array.isArray(s.days) && s.days.length ? JSON.stringify(s.days) : null, i, s.bookingMode === "callback" ? "callback" : "slot"]);
    }
  },
  async replaceSlots() {
    await q("DELETE FROM slot_times");
    for (const t of db.slots) await q("INSERT INTO slot_times (t) VALUES (?)", [t]);
  },
  async replaceAgencies() {
    await q("DELETE FROM agencies");
    for (let i = 0; i < db.agencies.length; i++) {
      const a = db.agencies[i];
      await q("INSERT INTO agencies (id, code, name, contact, active, sort) VALUES (?,?,?,?,?,?)",
        [a.id, a.code, a.name, a.contact ? fieldEnc(a.contact) : null, a.active === false ? 0 : 1, i]);
    }
  },
  async saveSettings() {
    for (const [k, v] of Object.entries(db.settings))
      await q("INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [k, v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)]);
  },
  async markCall(code, iso) {
    db.calls[code] = iso;
    await q("INSERT INTO calls (code, called_at) VALUES (?,?) ON DUPLICATE KEY UPDATE called_at = VALUES(called_at)", [code, iso]);
  },
  async addAudit(entry) {
    db.audit.push(entry);
    if (db.audit.length > AUDIT_CAP) db.audit.splice(0, db.audit.length - AUDIT_CAP);
    await q("INSERT INTO audit (at, user, action, detail) VALUES (?,?,?,?)", [entry.at, entry.user, entry.action, fieldEnc(entry.detail)]);
  },
  async setUserPassword(u) {
    await q("UPDATE users SET salt=?, hash=? WHERE id=?", [u.salt, u.hash, u.id]);
  },
  async addUser(u) {
    db.users.push(u); // ต้อง sync หน่วยความจำด้วย — ทุก API อ่านจาก db ไม่ได้ query ใหม่ทุกครั้ง
    await q("INSERT INTO users (id, username, name, role, agency_code, salt, hash) VALUES (?,?,?,?,?,?,?)", [u.id, u.username, fieldEnc(u.name), u.role, u.agencyCode || null, u.salt, u.hash]);
  },
  async updateUser(u) {
    await q("UPDATE users SET username=?, name=?, role=?, agency_code=?, salt=?, hash=? WHERE id=?", [u.username, fieldEnc(u.name), u.role, u.agencyCode || null, u.salt, u.hash, u.id]);
  },
  async deleteUser(id) {
    db.users = db.users.filter((x) => x.id !== id);
    await q("DELETE FROM users WHERE id=?", [id]);
  },
  // PDPA (retention): ลบคิวเก่าเกินกำหนด (เงื่อนไขเดียวกับโหมด json — ดูคอมเมนต์ที่ jsonMode.purgeOldBookings)
  async purgeOldBookings(cutoffDate, cutoffIso) {
    const where = "((`date` IS NOT NULL AND `date` <> '' AND `date` < ?) OR ((`date` IS NULL OR `date` = '') AND created_at < ?))";
    const rows = await q("SELECT code FROM bookings WHERE " + where, [cutoffDate, cutoffIso]);
    if (rows.length) {
      await q("DELETE FROM bookings WHERE " + where, [cutoffDate, cutoffIso]);
      const ph = rows.map(() => "?").join(",");
      await q(`DELETE FROM calls WHERE code IN (${ph})`, rows.map((r) => r.code));
      const codes = new Set(rows.map((r) => r.code));
      db.bookings = db.bookings.filter((b) => !codes.has(b.code));
      for (const c of codes) delete db.calls[c];
    }
    return rows.length;
  },
  async purgeOldAudit(cutoffIso) {
    const r = await q("DELETE FROM audit WHERE at < ?", [cutoffIso]);
    const before = db.audit.length;
    db.audit = db.audit.filter((e) => String(e.at || "") >= cutoffIso);
    return r && r.affectedRows != null ? r.affectedRows : before - db.audit.length;
  },
};

const impl = MODE === "mysql" ? mysqlMode : jsonMode;
module.exports = { mode: MODE, db, makeUser, ...impl, init: () => impl.init() };
