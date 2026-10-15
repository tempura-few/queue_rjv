// ============================================================
// lib/core.js — logic กลางทุกอย่างที่ API routes ของ Next.js เรียกใช้
// (พอร์ตมาจาก server.js ยุค Pure-Node ทั้งไฟล์ — กติกา/การตรวจรับเหมือนเดิมเป๊ะ)
// ============================================================
"use strict";
const crypto = require("crypto");
const store = require("./store.js");
const xlsxlite = require("./xlsxlite.js");
const { ROLES, normRole, can } = require("./roles.js");

const RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 }; // การจองจากภายนอก 10 ครั้ง/15 นาที/IP
const LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 }; // พยายามล็อกอินผิด 10 ครั้ง/15 นาที/IP
const RIGHTS_WHITELIST = ["ชำระเงินเอง", "ประกันสังคม", "หลักประกันสุขภาพ (บัตรทอง)", "ประกันเอกชน", "อื่น ๆ"];
const DEFAULT_CAPACITY = 4; // ที่นั่งต่อช่วงเวลา (แก้ได้รายบริการในหลังบ้าน)

const db = store.db;

// เริ่มต้นชุดข้อมูลครั้งเดียวต่อ process (memoized) — ทุก route ต้อง await ก่อนแตะ db
let initPromise = null;
function ensureInit() {
  return initPromise || (initPromise = store.init());
}

// ระยะเปิดจองล่วงหน้า (วัน) — แก้ได้จากหลังบ้าน ผ่าน /api/settings (ค่าเริ่มต้น 14)
const daysAhead = () => { const n = Number(db.settings.daysAhead); return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 14; };

// เงื่อนไขแท็บ "นัดที่กำลังจะถึง" — แก้ได้จากหลังบ้านผ่าน /api/settings
// (ค่าเริ่มต้น: ดู 7 วันข้างหน้า, ไม่รวมวันนี้, รวมสถานะไม่มาตามนัด เหมือนพฤติกรรมเดิม)
const boolSetting = (k, dflt) => {
  const v = db.settings[k];
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return dflt;
};
const upcomingDays = () => { const n = Number(db.settings.upcomingDays); return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 7; };
const upcomingIncludeToday = () => boolSetting("upcomingIncludeToday", false);
const upcomingIncludeNoshow = () => boolSetting("upcomingIncludeNoshow", true);

// สิทธิการรักษา (Payment / coverage) — แก้ได้จากหลังบ้านเป็นไทย+อังกฤษคู่กัน
// ค่าที่เก็บในคิวใช้ "ชื่อไทย" เป็นหลัก (ข้อมูลเดิมทั้งหมดใช้ต่อได้) ส่วน en ไว้แสดงหน้าผู้ป่วยโหมด EN
const DEFAULT_RIGHTS = [
  { th: "ชำระเงินเอง", en: "Self-pay" },
  { th: "ประกันสังคม", en: "Social Security Scheme" },
  { th: "หลักประกันสุขภาพ (บัตรทอง)", en: "Universal Coverage (Gold Card)" },
  { th: "ประกันเอกชน", en: "Private Insurance" },
  { th: "อื่น ๆ", en: "Others" },
];
const rightsAll = () => (Array.isArray(db.settings.rights) && db.settings.rights.length ? db.settings.rights : DEFAULT_RIGHTS);
const rightsList = () => rightsAll().map((r) => r.th);

// ---------- auth: JWT (HS256, เขียนเองด้วย crypto ของ Node — ไม่มี dependency) ----------
function checkPassword(user, password) {
  const h = crypto.scryptSync(password, user.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(user.hash));
}
// ตั้งรหัสผ่านใหม่ให้ user object (สุ่มเกลือใหม่ทุกครั้ง) — ผู้เรียกการันตีความยาว ≥ 6 แล้ว
function setPassword(user, password) {
  user.salt = crypto.randomBytes(16).toString("hex");
  user.hash = crypto.scryptSync(password, user.salt, 64).toString("hex");
}
// คีย์เซ็น token: ตั้ง AUTH_SECRET ให้ถาวรใน production — ไม่ตั้งจะสุ่มใหม่ทุกครั้งที่ restart (token เก่าใช้ไม่ได้ทันที)
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.AUTH_SECRET) console.log("[auth] ไม่ได้ตั้ง AUTH_SECRET — ใช้คีย์ชั่วคราว ทุก token จะหมดอายุเมื่อ restart กระบวนการ");
const TOKEN_HOURS = Number(process.env.AUTH_TTL_HOURS || 12); // อายุ token (ชม.)
function signToken(user) {
  const b64u = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b64u({ alg: "HS256", typ: "JWT" });
  const now = Date.now();
  const payload = b64u({ sub: user.id, iat: now, exp: now + TOKEN_HOURS * 3600e3 });
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(head + "." + payload).digest("base64url");
  return head + "." + payload + "." + sig;
}
function verifyToken(token) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) return null;
  let expect, got;
  try {
    expect = crypto.createHmac("sha256", AUTH_SECRET).update(parts[0] + "." + parts[1]).digest();
    got = Buffer.from(parts[2], "base64url");
  } catch { return null; }
  if (got.length !== expect.length || !crypto.timingSafeEqual(got, expect)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" && Date.now() <= payload.exp ? payload : null;
  } catch { return null; }
}
// ดึงผู้ใช้จาก header Authorization ของ Next Request — ดึงสิทธิ์/ชื่อจากฐานข้อมูลล่าสุดเสมอ
function userFromRequest(request) {
  const h = request.headers.get("authorization") || "";
  const payload = h.startsWith("Bearer ") ? verifyToken(h.slice(7).trim()) : null;
  if (!payload) return null;
  return db.users.find((u) => u.id === payload.sub) || null;
}
const ipOf = (request) => {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) || "local";
};

// ---------- ตัวช่วยกลาง ----------
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0"); };
const isDateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayISO() && d <= datePlus(daysAhead());
function datePlus(n) { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function normPhone(p) { return String(p || "").replace(/[\s\-()]/g, ""); }
// เบอร์ที่ติดต่อกลับได้จริง: มือถือไทย 06/08/09 รวม 10 หลัก · สายบ้าน 02–05/07 รวม 9 หลัก · ต่างประเทศ +รหัสประเทศ (ห้ามขึ้นต้น 0)
const phoneOk = (p) => /^(0[689]\d{8}|0[23457]\d{7}|\+[1-9]\d{6,14})$/.test(normPhone(p));
// อีเมล (ไม่บังคับกรอก) — ตรวจแค่รูปแบบง่าย: ไม่มีช่องว่าง มี @ ตรงกลาง โดเมนมีจุด (ตรงกับ emailOk ใน lib/client.js)
const normEmail = (v) => String(v || "").trim().slice(0, 120);
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(v));
const EMAIL_ERR = "รูปแบบอีเมลไม่ถูกต้อง (เช่น name@email.com) — เว้นว่างได้ถ้าไม่มี";
// ช่องทางติดต่อ: เบอร์โทร หรือ อีเมล อย่างน้อย 1 อย่าง (ต่างชาติหลายคนไม่ใส่เบอร์ — ใช้อีเมลอย่างเดียวได้)
const CONTACT_ERR = "กรุณากรอกเบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง";
const svc = (id) => db.services.find((s) => s.id === id);
function slotsFor(serviceId) { const s = svc(serviceId); return Array.isArray(s && s.slots) && s.slots.length ? s.slots : db.slots; }
// ช่วงเวลาของบริการใน "วันที่ระบุ" — บริการที่ตั้งเวลารายวัน (slotsByDay) ใช้เวลาของวันนั้น ๆ
// วันที่ไม่มีคีย์/เป็นรายการว่าง = ไม่มีเวลาให้บริการวันนั้น; บริการที่ไม่ได้ตั้งรายวันใช้ชุดเดียวทุกวันเหมือนเดิม
function slotsForDate(serviceId, dateISO) {
  const s = svc(serviceId);
  if (s && s.slotsByDay && typeof s.slotsByDay === "object" && dateISO) {
    const list = s.slotsByDay[String(new Date(dateISO + "T00:00:00").getDay())];
    return Array.isArray(list) ? list : [];
  }
  return slotsFor(serviceId);
}
// วันให้บริการ (service.days): เลขวันตาม getDay() 0=อาทิตย์ … 6=เสาร์ — ไม่ได้ตั้ง = เปิดทุกวัน
// โหมดรายวัน: วันที่ตั้งเวลาไว้ ≥ 1 ช่วง = วันที่เปิด
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // เรียงแบบไทย: จ อ พ พฤ ศ ส อา
const DAY_LABELS = { 1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัสบดี", 5: "ศุกร์", 6: "เสาร์", 0: "อาทิตย์" };
function svcOpenDays(s) {
  if (s && s.slotsByDay && typeof s.slotsByDay === "object")
    return DAY_ORDER.filter((d) => Array.isArray(s.slotsByDay[String(d)]) && s.slotsByDay[String(d)].length);
  return Array.isArray(s.days) && s.days.length ? s.days : DAY_ORDER;
}
function dayOpenOn(s, dateISO) {
  if (s && s.slotsByDay && typeof s.slotsByDay === "object")
    return slotsForDate(s && s.id, dateISO).length > 0; // รายวัน: วันที่ไม่มีเวลา = ปิด
  if (!s || !Array.isArray(s.days) || !s.days.length) return true;
  return s.days.includes(new Date(dateISO + "T00:00:00").getDay());
}
function daysLabel(s) {
  return DAY_ORDER.filter((d) => svcOpenDays(s).includes(d)).map((d) => DAY_LABELS[d]).join(" ");
}
function activeCount(serviceId, date, time, excludeCode) {
  return db.bookings.filter((b) => b.serviceId === serviceId && b.date === date && b.time === time && b.status !== "cancelled" && b.code !== excludeCode).length;
}
function remaining(serviceId, date, time, excludeCode) {
  const s = svc(serviceId);
  if (!dayOpenOn(s, date)) return 0; // วันที่บริการไม่เปิด = ที่นั่งเหลือ 0 ทุกช่วง (ป้องกันการยิง API ตรง ๆ)
  const cap = (s && s.capacity) || DEFAULT_CAPACITY;
  return Math.max(0, cap - activeCount(serviceId, date, time, excludeCode));
}
function nextQno(date, serviceId) {
  const k = date + "|" + serviceId;
  db.counters[k] = (db.counters[k] || 0) + 1;
  return db.counters[k];
}
function genCode(date) {
  for (;;) {
    const code = `RV-${date.slice(2).replaceAll("-", "")}-${100 + Math.floor(Math.random() * 900)}`;
    if (!db.bookings.some((b) => b.code === code)) return code;
  }
}
// รหัสคำขอรอนัดหมาย (บริการประเภท callback — ไม่มีวันที่นัด)
function genCallbackCode() {
  for (;;) {
    const code = `RV-CB-${100 + Math.floor(Math.random() * 900)}`;
    if (!db.bookings.some((b) => b.code === code)) return code;
  }
}
async function audit(user, action, detail) {
  await store.addAudit({ at: new Date().toISOString(), user: (user && user.username) || "public", action, detail: detail || "" });
}
function createBooking(actor, data, opts = {}) {
  // คืน {ok, booking} หรือ {ok:false, error, status}
  // opts.walkin = คิว walk-in: คนมาถึงเคาน์เตอร์แล้วต้องรับเสมอ — ข้ามเพดานความจุออนไลน์
  //   และรับช่วงเวลาที่ผ่านไปแล้วของวันนี้ได้ (เวลาใช้เพียงจัดลำดับคิว)
  const walkin = !!(opts && opts.walkin);
  const s = svc(data.serviceId);
  if (!s || s.active === false) return { ok: false, status: 400, error: "บริการนี้ไม่เปิดให้จอง" };
  const items = Array.isArray(s.items) ? s.items : [];
  if (items.length && !items.some((i) => i.id === data.itemId)) return { ok: false, status: 400, error: "รายการบริการไม่ถูกต้อง" };
  // บริการที่ไม่มีรายการย่อย (optional) — จองได้เลยโดยไม่ต้องระบุรายการ
  if (!isDateOk(data.date)) return { ok: false, status: 400, error: `วันที่ไม่ถูกต้อง (จองล่วงหน้าได้ 1–${daysAhead()} วัน)` };
  // คิว walk-in ข้ามได้ (คนมาถึงที่เคาน์เตอร์แล้ว) แต่การจองล่วงหน้าต้องเป็นวันที่บริการนี้เปิดเท่านั้น
  if (!walkin && !dayOpenOn(s, data.date)) return { ok: false, status: 400, error: `บริการนี้ให้จองได้เฉพาะวัน ${daysLabel(s)}` };
  if (!slotsForDate(data.serviceId, data.date).includes(data.time)) return { ok: false, status: 400, error: "ช่วงเวลาไม่ถูกต้อง" };
  if (!walkin && data.date === todayISO() && data.time.replace(":", "") <= nowHHMM()) return { ok: false, status: 400, error: "ช่วงเวลานี้ผ่านไปแล้วสำหรับวันนี้" };
  if (!String(data.name || "").trim()) return { ok: false, status: 400, error: "กรุณากรอกชื่อ" };
  const phone = normPhone(data.phone);
  if (phone && !phoneOk(phone)) return { ok: false, status: 400, error: "เบอร์โทรไม่ถูกต้อง — มือถือไทย 06/08/09 ตามด้วยเลข 8 หลัก สายบ้าน 0 รวม 9 หลัก หรือ +รหัสประเทศ (เช่น +95...)" };
  const email = normEmail(data.email);
  if (email && !emailOk(email)) return { ok: false, status: 400, error: EMAIL_ERR };
  if (!phone && !email) return { ok: false, status: 400, error: CONTACT_ERR };
  if (!walkin && remaining(data.serviceId, data.date, data.time) <= 0) return { ok: false, status: 409, error: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น" };
  const agencyCode = String(data.agencyCode || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const b = {
    code: genCode(data.date),
    qno: nextQno(data.date, data.serviceId),
    serviceId: data.serviceId, itemId: items.length ? data.itemId : undefined,
    date: data.date, time: data.time,
    name: String(data.name).trim().slice(0, 100).replace(/[<>]/g, ""),
    phone: phone.slice(0, 20),
    email: email || undefined,
    rights: rightsList().includes(data.rights) ? data.rights : rightsList()[0],
    agencyCode: agencyCode || undefined,
    source: data.source || (agencyCode ? "agency" : "online"),
    note: String(data.note || "").trim().slice(0, 200).replace(/[<>]/g, ""),
    status: data.status || "pending",
    createdAt: new Date().toISOString(),
  };
  return { ok: true, booking: b }; // ผู้เรียกเป็นคำสั่ง await store.addBooking(b) เพื่อบันทึก
}

// สร้าง "คำขอรอนัดหมาย" สำหรับบริการประเภท callback — ไม่มีวัน/เวลา รอ รพ. โทรกลับนัด
function createCallbackBooking(data) {
  const s = svc(data.serviceId);
  if (!s || s.active === false) return { ok: false, status: 400, error: "บริการนี้ไม่เปิดให้จอง" };
  if (s.bookingMode !== "callback") return { ok: false, status: 400, error: "บริการนี้ต้องเลือกวัน–เวลา" };
  const items = Array.isArray(s.items) ? s.items : [];
  if (items.length && !items.some((i) => i.id === data.itemId)) return { ok: false, status: 400, error: "รายการบริการไม่ถูกต้อง" };
  if (!String(data.name || "").trim()) return { ok: false, status: 400, error: "กรุณากรอกชื่อ" };
  const phone = normPhone(data.phone);
  if (phone && !phoneOk(phone)) return { ok: false, status: 400, error: "เบอร์โทรไม่ถูกต้อง — มือถือไทย 06/08/09 ตามด้วยเลข 8 หลัก สายบ้าน 0 รวม 9 หลัก หรือ +รหัสประเทศ (เช่น +95...)" };
  const email = normEmail(data.email);
  if (email && !emailOk(email)) return { ok: false, status: 400, error: EMAIL_ERR };
  if (!phone && !email) return { ok: false, status: 400, error: CONTACT_ERR };
  const b = {
    code: genCallbackCode(),
    qno: nextQno("callback", data.serviceId), // เลขที่คำขอ แยกอิสระจากคิวรายวัน
    serviceId: data.serviceId, itemId: items.length ? data.itemId : undefined,
    date: "", time: "",
    name: String(data.name).trim().slice(0, 100).replace(/[<>]/g, ""),
    phone: phone.slice(0, 20),
    email: email || undefined,
    rights: rightsList().includes(data.rights) ? data.rights : rightsList()[0],
    source: "callback",
    note: String(data.note || "").trim().slice(0, 200).replace(/[<>]/g, ""),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  return { ok: true, booking: b };
}

// ---------- นำเข้าคิวจากไฟล์ (Excel/CSV ของตัวแทน) ----------
const IMPORT_MAX_ROWS = 1000;
// ชื่อหัวคอลัมน์ที่รับรู้ (เทียบแบบตัดช่องว่าง — ใช้เทมเพลตของระบบหรือตั้งชื่อเองก็ได้)
const IMPORT_HEADERS = {
  date: ["วันที่", "date"],
  time: ["เวลา", "เวลาคิว", "time"],
  service: ["บริการ", "แผนก", "service"],
  item: ["รายการ", "รายการย่อย", "รายการบริการ", "แพ็กเกจ", "item"],
  name: ["ชื่อ", "ชื่อ-นามสกุล", "ชื่อ นามสกุล", "ชื่อนามสกุล", "ผู้จอง", "ชื่อผู้รับบริการ", "name"],
  phone: ["เบอร์", "เบอร์โทร", "เบอร์โทรศัพท์", "โทรศัพท์", "โทร", "phone", "tel", "mobile"],
  email: ["อีเมล", "อีเมล์", "email", "e-mail", "mail"],
  rights: ["สิทธิ", "สิทธิการรักษา", "สิทธิการรักษาพยาบาล", "rights"],
  note: ["หมายเหตุ", "note"],
};
// แปลงค่าเซลล์วันที่ → "YYYY-MM-DD" (รองรับ 2026-10-15, 15/10/2026, 15/10/2569 พ.ศ., 15/10/69 พ.ศ.)
function importDate(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const mk = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mk(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (m[3].length === 2) y = 2500 + y - 543; // 69 → พ.ศ. 2569 → ค.ศ. 2026
    else if (y > 2400) y -= 543;               // ปี พ.ศ. เต็ม
    return mk(y, m[2], m[1]);
  }
  return null;
}
// แปลงค่าเซลล์เวลา → "HH:MM" (รองรับ 9:00, 0900, เวลาที่ติดมากับวันที่ เช่น "2026-10-15 09:00")
function importTime(v, fromDateCell) {
  const try1 = (s) => {
    s = String(s ?? "").trim();
    if (!s) return null;
    let m = s.match(/(\d{1,2}):(\d{2})/); if (m) return String(m[1]).padStart(2, "0") + ":" + m[2];
    if (/^\d{4}$/.test(s)) return s.slice(0, 2) + ":" + s.slice(2);
    return null;
  };
  return try1(v) || try1(fromDateCell && String(fromDateCell).split(" ")[1] || "");
}
// เบอร์โทรจาก Excel: ตัวเลขที่โดนตัดเลข 0 ต้น / มี .0 ต่อท้าย / ตัวเลขยกกำลัง — ซ่อมให้ก่อนตรวจ
function importPhone(v) {
  let s = String(v ?? "").trim();
  if (!s || s === "-") return "";
  if (/^\d+(\.0+)?$/.test(s)) {
    s = s.replace(/\.0+$/, "");
    if (s.length === 9 && /^[689]/.test(s)) s = "0" + s; // เบอร์มือถือไทยที่ Excel กินเลข 0 ต้น
  } else if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Math.round(Number(s));
    if (Number.isSafeInteger(n)) s = String(n);
  }
  return normPhone(s);
}
const importNormText = (v) => String(v ?? "").replace(/\s+/g, "").toLowerCase();
function resolveServiceByName(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const target = importNormText(raw.replace(/^[^\p{L}\p{N}]+/u, "")); // ตัดไอคอน/อีโมจิที่นำหน้าชื่อ
  let hit = db.services.find((s) => s.id === raw || importNormText(s.name) === target || importNormText((s.icon || "") + s.name) === target);
  if (hit) return hit;
  const fuzzy = db.services.filter((s) => importNormText(s.name).includes(target) || target.includes(importNormText(s.name)));
  return fuzzy.length === 1 ? fuzzy[0] : null; // ไม่เจอหรือกำกวม → null
}
function resolveRights(v) {
  const s = String(v ?? "").trim();
  const list = rightsList();
  if (!s) return list[list.length - 1];
  if (list.includes(s)) return s;
  return list.find((r) => r.includes(s) || s.includes(r)) || list[list.length - 1]; // "บัตรทอง" → หลักประกันสุขภาพ (บัตรทอง)
}
// ตาราง (แถวแรก = หัวคอลัมน์) → แถวข้อมูลดิบ {date,time,service,item,name,phone,rights,note} พร้อมเลขแถว
function tableToRawRows(table) {
  const head = (table[0] || []).map((c) => importNormText(c));
  const colOf = {};
  for (const [key, aliases] of Object.entries(IMPORT_HEADERS))
    colOf[key] = head.findIndex((h) => aliases.some((a) => h === importNormText(a)));
  // ผู้ใช้อาจสลับคอลัมน์/เพิ่มคอลัมน์เอง — จับคู่หัวที่มีชื่อมาตรฐานซ้อนอยู่ (เช่น "วันที่นัดหมาย")
  // เทียบทางเดียว: หัวต้อง"มี"ชื่อมาตรฐานเต็ม ๆ ข้างใน — กันหัวสั้น ๆ อย่าง "a" โดน "date" กลืนเป็นคอลัมน์วันที่
  for (const [key, aliases] of Object.entries(IMPORT_HEADERS)) {
    if (colOf[key] >= 0) continue;
    colOf[key] = head.findIndex((h) => h && h.length >= 2 && aliases.some((a) => h.includes(importNormText(a))));
  }
  if (colOf.name < 0 || colOf.date < 0 || colOf.service < 0)
    throw new Error("ไม่พบหัวคอลัมน์ที่จำเป็น (ต้องมี วันที่ / เวลา / บริการ / ชื่อ-นามสกุล) — แนะนำให้ใช้เทมเพลตของระบบ");
  const get = (row, key) => (colOf[key] >= 0 ? String(row[colOf[key]] ?? "").trim() : "");
  const out = [];
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue; // ข้ามแถวว่าง
    out.push({
      rowNo: i + 1,
      date: get(row, "date"), time: get(row, "time"), service: get(row, "service"),
      item: get(row, "item"), name: get(row, "name"), phone: get(row, "phone"),
      email: get(row, "email").slice(0, 120),
      rights: get(row, "rights"), note: get(row, "note").slice(0, 200),
    });
  }
  return out.slice(0, IMPORT_MAX_ROWS);
}
// ตรวจทานรายแถว: คืน {row, date, time, serviceId, itemId, name, phone, rights, note, ok, error}
function analyzeImportRows(raws) {
  const seen = new Set();
  let analyzed = raws.map((r) => {
    const a = { row: r.rowNo, name: String(r.name || "").trim().slice(0, 100), ok: false, error: "" };
    if (!a.name) return { ...a, error: "ไม่มีชื่อ" };
    a.date = importDate(r.date);
    if (!a.date) return { ...a, error: `วันที่ "${r.date}" ไม่ถูกต้อง (ใช้ ปปปป-ดด-วว เช่น 2026-10-15)` };
    const s = resolveServiceByName(r.service);
    if (!s) return { ...a, error: `ไม่พบบริการ "${r.service}"` };
    a.serviceId = s.id; a.serviceName = s.name;
    a.time = importTime(r.time, r.date);
    const validTimes = slotsForDate(s.id, a.date);
    if (!a.time || !validTimes.includes(a.time))
      return { ...a, error: `เวลา "${r.time || "-"}" ไม่ใช่ช่วงเวลาของบริการนี้วันที่ ${a.date} (${validTimes.join(", ") || "ไม่มีเวลาให้บริการวันนี้"})` };
    if (s.active === false) return { ...a, error: `บริการ "${s.name}" ปิดอยู่` };
    if (r.item) {
      const nt = importNormText(r.item);
      let it = s.items.find((i) => importNormText(i.name) === nt);
      if (!it) { const fuzzy = s.items.filter((i) => importNormText(i.name).includes(nt)); if (fuzzy.length === 1) it = fuzzy[0]; }
      if (!it) return { ...a, error: `ไม่พบรายการ "${r.item}" ในบริการ ${s.name}` };
      a.itemId = it.id;
    } else a.itemId = s.items.length ? s.items[0].id : undefined; // บริการไม่มีรายการย่อยก็นำเข้าได้
    if (!isDateOk(a.date)) return { ...a, error: `วันที่ ${a.date} อยู่นอกช่วงเปิดจอง (จองล่วงหน้าได้ถึง ${datePlus(daysAhead())})` };
    if (!dayOpenOn(s, a.date)) return { ...a, error: `วันที่ ${a.date} ไม่ใช่วันให้บริการของ "${s.name}" (เปิดเฉพาะวัน ${daysLabel(s)})` };
    if (a.date === todayISO() && a.time.replace(":", "") <= nowHHMM()) return { ...a, error: `ช่วงเวลา ${a.time} วันนี้ผ่านไปแล้ว` };
    a.phone = importPhone(r.phone);
    if (a.phone && !phoneOk(a.phone)) return { ...a, error: `เบอร์โทร "${r.phone}" ไม่ถูกต้อง (เว้นว่างได้ถ้าไม่ทราบ)` };
    a.email = normEmail(r.email);
    if (a.email && !emailOk(a.email)) return { ...a, error: `อีเมล "${r.email}" ไม่ถูกต้อง (เว้นว่างได้)` };
    a.rights = resolveRights(r.rights);
    a.note = String(r.note || "").trim().slice(0, 200);
    const dupKey = `${importNormText(a.name)}|${a.phone}|${a.date}|${a.time}|${a.serviceId}`;
    if (seen.has(dupKey)) return { ...a, error: "ซ้ำกับแถวอื่นในไฟล์เดียวกัน" };
    seen.add(dupKey);
    a.ok = true;
    return a;
  });
  // เตือนความจุล่วงหน้า: กลุ่มเดียวกัน (วัน/เวลา/บริการ) เกินที่นั่งที่เหลือ → แถวที่เกินถูกข้าม
  const seatCount = new Map();
  for (const a of analyzed) {
    if (!a.ok) continue;
    const k = `${a.serviceId}|${a.date}|${a.time}`;
    const left = remaining(a.serviceId, a.date, a.time);
    const used = seatCount.get(k) || 0;
    if (used >= left) { a.ok = false; a.error = `ช่วง ${a.time} ของบริการนี้เต็มแล้ว (เหลือ ${left} ที่)`; continue; }
    seatCount.set(k, used + 1);
  }
  return analyzed;
}

// ---------- rate limit ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (arr.length >= RATE_LIMIT.max) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  return false;
}
// นับเฉพาะครั้งที่ล็อกอินผิด — กัน brute force รหัสผ่าน
const loginFails = new Map();
function loginFailTimes(ip) {
  const now = Date.now();
  const arr = (loginFails.get(ip) || []).filter((t) => now - t < LOGIN_LIMIT.windowMs);
  loginFails.set(ip, arr);
  return arr;
}
const isLoginLimited = (ip) => loginFailTimes(ip).length >= LOGIN_LIMIT.max;
const recordLoginFail = (ip) => loginFailTimes(ip).push(Date.now());
const clearLoginFails = (ip) => loginFails.delete(ip);

module.exports = {
  store, db, xlsxlite,
  ensureInit, daysAhead, upcomingDays, upcomingIncludeToday, upcomingIncludeNoshow,
  checkPassword, setPassword, signToken, verifyToken, userFromRequest, ipOf,
  ROLES, normRole, can,
  todayISO, nowHHMM, isDateOk, datePlus, normPhone, phoneOk, normEmail, emailOk,
  svc, slotsFor, slotsForDate, remaining, nextQno, genCode, genCallbackCode, audit, createBooking, createCallbackBooking,
  dayOpenOn, daysLabel, svcOpenDays,
  IMPORT_MAX_ROWS, tableToRawRows, analyzeImportRows,
  rateLimited, isLoginLimited, recordLoginFail, clearLoginFails,
  RIGHTS_WHITELIST, DEFAULT_CAPACITY, rightsAll, rightsList,
};
