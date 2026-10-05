// ============================================================
// ระบบจองคิวโรงพยาบาลราชเวช เชียงใหม่ — Server (production)
// Pure Node.js ไม่มี dependency: คัดลอกโฟลเดอร์ แล้ว `node server.js`
// ข้อมูลเก็บที่ data/app-data.json (สำรองไฟล์นี้ทุกวัน — ดู DEPLOY.md)
// ============================================================
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8124);
const PUBLIC_DIR = path.join(__dirname, "public");
const store = require("./store.js"); // [BUNDLE-CUT]
const SESSION_HOURS = 12;
const RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 }; // การจองจากภายนอก 10 ครั้ง/15 นาที/IP
const LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 }; // พยายามล็อกอินผิด 10 ครั้ง/15 นาที/IP
const RIGHTS_WHITELIST = ["ชำระเงินเอง", "ประกันสังคม", "หลักประกันสุขภาพ (บัตรทอง)", "ประกันเอกชน", "อื่น ๆ"];
const DEFAULT_CAPACITY = 4; // ที่นั่งต่อช่วงเวลา (แก้ได้รายบริการในหลังบ้าน)

// ---------- ชุดข้อมูลกลาง (โหลด/เขียนผ่าน store.js — สลับโหมดด้วย env STORAGE) ----------
const db = store.db;

// ---------- auth ----------
function checkPassword(user, password) {
  const h = crypto.scryptSync(password, user.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(user.hash));
}
const sessions = new Map(); // token -> {userId, expires}
function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_HOURS * 3600e3 });
  return token;
}
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (h) for (const part of h.split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).qsession;
  if (!token || !sessions.has(token)) return null;
  const s = sessions.get(token);
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return db.users.find((u) => u.id === s.userId) || null;
}

// ---------- ตัวช่วยกลาง ----------
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const nowHHMM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0"); };
const isDateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayISO() && d <= datePlus(14);
function datePlus(n) { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function normPhone(p) { return String(p || "").replace(/[\s\-()]/g, ""); }
const phoneOk = (p) => /^(0\d{8,9}|\+\d{7,15})$/.test(normPhone(p)); // เบอร์ไทย 0X หรือต่างประเทศ +NNNNNNN
const svc = (id) => db.services.find((s) => s.id === id);
function slotsFor(serviceId) { const s = svc(serviceId); return Array.isArray(s && s.slots) && s.slots.length ? s.slots : db.slots; }
function activeCount(serviceId, date, time, excludeCode) {
  return db.bookings.filter((b) => b.serviceId === serviceId && b.date === date && b.time === time && b.status !== "cancelled" && b.code !== excludeCode).length;
}
function remaining(serviceId, date, time, excludeCode) {
  const cap = (svc(serviceId) && svc(serviceId).capacity) || DEFAULT_CAPACITY;
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
async function audit(user, action, detail) {
  await store.addAudit({ at: new Date().toISOString(), user: (user && user.username) || "public", action, detail: detail || "" });
}
function createBooking(actor, data) {
  // คืน {ok, booking} หรือ {ok:false, error, status}
  const s = svc(data.serviceId);
  if (!s || s.active === false) return { ok: false, status: 400, error: "บริการนี้ไม่เปิดให้จอง" };
  if (!s.items.some((i) => i.id === data.itemId)) return { ok: false, status: 400, error: "รายการบริการไม่ถูกต้อง" };
  if (!isDateOk(data.date)) return { ok: false, status: 400, error: "วันที่ไม่ถูกต้อง (จองล่วงหน้าได้ 1–14 วัน)" };
  if (!slotsFor(data.serviceId).includes(data.time)) return { ok: false, status: 400, error: "ช่วงเวลาไม่ถูกต้อง" };
  if (data.date === todayISO() && data.time.replace(":", "") <= nowHHMM()) return { ok: false, status: 400, error: "ช่วงเวลานี้ผ่านไปแล้วสำหรับวันนี้" };
  if (!String(data.name || "").trim()) return { ok: false, status: 400, error: "กรุณากรอกชื่อ" };
  if (!phoneOk(data.phone)) return { ok: false, status: 400, error: "เบอร์โทรไม่ถูกต้อง (เบอร์ไทย 0XXXXXXXXX หรือ +รหัสประเทศ เช่น +95...)" };
  if (remaining(data.serviceId, data.date, data.time) <= 0) return { ok: false, status: 409, error: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น" };
  const agencyCode = String(data.agencyCode || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const b = {
    code: genCode(data.date),
    qno: nextQno(data.date, data.serviceId),
    serviceId: data.serviceId, itemId: data.itemId,
    date: data.date, time: data.time,
    name: String(data.name).trim().slice(0, 100).replace(/[<>]/g, ""),
    phone: normPhone(data.phone).slice(0, 20),
    rights: RIGHTS_WHITELIST.includes(data.rights) ? data.rights : "อื่น ๆ",
    agencyCode: agencyCode || undefined,
    source: data.source || (agencyCode ? "agency" : "online"),
    note: String(data.note || "").trim().slice(0, 200).replace(/[<>]/g, ""),
    status: data.status || "pending",
    createdAt: new Date().toISOString(),
  };
  return { ok: true, booking: b }; // ผู้เรียกเป็นคำสั่ง await store.addBooking(b) เพื่อบันทึก
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
function isLoginLimited(ip) { return loginFailTimes(ip).length >= LOGIN_LIMIT.max; }
function recordLoginFail(ip) { loginFailTimes(ip).push(Date.now()); }

// ---------- HTTP ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function sendJson(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, headers));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 100e3) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { resolve({}); } });
    req.on("error", reject);
  });
}
const bad = (res, msg, status = 400) => sendJson(res, status, { error: msg });

async function handleApi(req, res, url) {
  const user = currentUser(req);
  const p = url.pathname;
  const isAdmin = user && user.role === "admin";

  if (p === "/api/login" && req.method === "POST") {
    const ip = req.socket.remoteAddress;
    if (isLoginLimited(ip)) return bad(res, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองอีกครั้งใน 15 นาที", 429);
    const body = await readBody(req);
    const u = db.users.find((x) => x.username === String(body.username || "").trim());
    if (!u || !checkPassword(u, String(body.password || ""))) {
      recordLoginFail(ip);
      await audit(null, "login_fail", "user: " + String(body.username || "").slice(0, 50) + " ip: " + ip);
      return bad(res, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
    }
    loginFails.delete(ip); // ล็อกอินถูก — เคลียร์จำนวนครั้งที่ผิดของ IP นี้
    const token = createSession(u);
    await audit(u, "login_ok", "");
    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    return sendJson(res, 200, { user: { username: u.username, name: u.name, role: u.role } },
      { "Set-Cookie": `qsession=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}` });
  }
  if (p === "/api/logout" && req.method === "POST") {
    const token = parseCookies(req).qsession;
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": "qsession=; HttpOnly; Path=/; Max-Age=0" });
  }
  if (p === "/api/me" && req.method === "GET") {
    if (!user) return bad(res, "not signed in", 401);
    return sendJson(res, 200, { user: { username: user.username, name: user.name, role: user.role } });
  }

  // ---- สาธารณะ: บริการ/ช่วงเวลา/ความว่าง ----
  if (p === "/api/services" && req.method === "GET") {
    const list = user ? db.services : db.services.filter((s) => s.active !== false);
    return sendJson(res, 200, { services: list });
  }
  if (p === "/api/slots" && req.method === "GET") return sendJson(res, 200, { slots: db.slots });
  if (p === "/api/slots" && req.method === "PUT") {
    if (!isAdmin) return bad(res, "forbidden", 403);
    const body = await readBody(req);
    if (!Array.isArray(body.slots) || !body.slots.length || body.slots.some((t) => !/^\d{2}:\d{2}$/.test(t))) return bad(res, "รูปแบบช่วงเวลาไม่ถูกต้อง");
    db.slots = [...new Set(body.slots)].sort();
    await store.replaceSlots();
    await audit(user, "slots_update", db.slots.join(","));
    return sendJson(res, 200, { slots: db.slots });
  }
  if (p === "/api/availability" && req.method === "GET") {
    const serviceId = url.searchParams.get("service");
    const date = url.searchParams.get("date");
    const s = svc(serviceId);
    if (!s || !isDateOk(date)) return bad(res, "bad request");
    return sendJson(res, 200, { slots: slotsFor(serviceId).map((t) => ({ time: t, remaining: remaining(serviceId, date, t) })) });
  }

  // ---- สาธารณะ: จองคิว ----
  if (p === "/api/bookings" && req.method === "POST") {
    if (rateLimited(req.socket.remoteAddress)) return bad(res, "จองบ่อยเกินไป กรุณารอสักครู่ (จำกัด 10 ครั้ง/15 นาที)", 429);
    const body = await readBody(req);
    if (body.consent !== true) return bad(res, "กรุณายินยอมการเก็บข้อมูล (PDPA) ก่อนจอง");
    const r = createBooking(null, body);
    if (!r.ok) return bad(res, r.error, r.status);
    await store.addBooking(r.booking);
    await audit(null, "booking_online", `${r.booking.code} ${r.booking.name}`);
    return sendJson(res, 201, { code: r.booking.code, qno: r.booking.qno });
  }
  let m = p.match(/^\/api\/booking\/([A-Za-z0-9-]+)$/);
  if (m && req.method === "GET") {
    const b = db.bookings.find((x) => x.code === m[1]);
    if (!b) return bad(res, "ไม่พบรหัสการจองนี้", 404);
    const s = svc(b.serviceId) || { icon: "❓", name: "บริการที่ถูกลบ" };
    return sendJson(res, 200, { booking: { code: b.code, qno: b.qno, service: s.name, icon: s.icon, date: b.date, time: b.time, status: b.status, agencyCode: b.agencyCode } });
  }

  // ---- ต่อจากนี้ต้องล็อกอิน ----
  if (!user) return bad(res, "not signed in", 401);

  if (p === "/api/bookings" && req.method === "GET") {
    const date = url.searchParams.get("date");
    const service = url.searchParams.get("service");
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    let list = db.bookings;
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q) || b.phone.includes(q.replace(/\s/g, "")) || b.code.toLowerCase().includes(q));
    else if (date) list = list.filter((b) => b.date === date);
    if (service && service !== "all") list = list.filter((b) => b.serviceId === service);
    list = [...list].sort((a, b2) => (a.date + a.time).localeCompare(b2.date + b2.time)).slice(0, 200);
    return sendJson(res, 200, { bookings: list });
  }
  if (p === "/api/walkin" && req.method === "POST") {
    const body = await readBody(req);
    const s0 = svc(body.serviceId);
    if (!body.itemId && s0) body.itemId = s0.items[0].id;
    body.date = todayISO();
    body.status = "confirmed";
    body.source = String(body.agencyCode || "").trim() ? "agency" : "walkin";
    body.note = body.note || "ลงทะเบียนหน้าเคาน์เตอร์";
    const r = createBooking(user, body);
    if (!r.ok) return bad(res, r.error, r.status);
    await store.addBooking(r.booking);
    await audit(user, "booking_walkin", `${r.booking.code} ${r.booking.name}`);
    return sendJson(res, 201, { code: r.booking.code, qno: r.booking.qno });
  }
  if (p === "/api/batch" && req.method === "POST") {
    const body = await readBody(req);
    const rows = (Array.isArray(body.rows) ? body.rows : []).map((r) => ({ name: String(r.name || "").trim(), phone: String(r.phone || "").trim() })).filter((r) => r.name);
    if (!rows.length) return bad(res, "ต้องมีรายชื่ออย่างน้อย 1 คน");
    if (!String(body.agencyCode || "").trim()) return bad(res, "กรุณาใส่รหัสตัวแทน");
    const s = svc(body.serviceId);
    if (!s) return bad(res, "บริการไม่ถูกต้อง");
    const left = remaining(body.serviceId, body.date, body.time);
    if (rows.length > left) return bad(res, `ที่นั่งเหลือ ${left} ที่เท่านั้น (ต้องการ ${rows.length}) — เลือกเวลาอื่นหรือแบ่งเป็นหลายช่วงเวลา`);
    const made = [];
    for (const r of rows) {
      const res2 = createBooking(user, {
        serviceId: body.serviceId, itemId: s.items[0].id, date: body.date, time: body.time,
        name: r.name, phone: r.phone || "0900000000", rights: body.rights,
        agencyCode: body.agencyCode, source: "agency", note: `รับเป็นชุดจากตัวแทน ${String(body.agencyCode).toUpperCase()}`,
        status: "confirmed",
      });
      if (!res2.ok) return bad(res, `บันทึกไม่สำเร็จ (รายชื่อ ${r.name}): ${res2.error}`, res2.status);
      if (!r.phone) res2.booking.phone = "-"; // ตัวแทนไม่ระบุเบอร์ — เก็บเป็นขีดแทนเบอร์ปลอม
      await store.addBooking(res2.booking);
      made.push(res2.booking);
    }
    await audit(user, "booking_batch", `${body.agencyCode.toUpperCase()} × ${made.length} วันที่ ${body.date} ${body.time}`);
    return sendJson(res, 201, { count: made.length, codes: made.map((b) => b.code) });
  }
  m = p.match(/^\/api\/bookings\/([A-Za-z0-9-]+)$/);
  if (m && (req.method === "PATCH" || req.method === "DELETE")) {
    const b = db.bookings.find((x) => x.code === m[1]);
    if (!b) return bad(res, "ไม่พบคิวนี้", 404);
    if (req.method === "DELETE") { // = ยกเลิก
      if (b.status === "cancelled") return bad(res, "คิวนี้ยกเลิกไปแล้ว");
      b.status = "cancelled";
      await store.updateBooking(b);
      await audit(user, "status_change", `${b.code} → cancelled`);
      return sendJson(res, 200, { ok: true });
    }
    const body = await readBody(req);
    if (body.status) {
      if (!["pending", "confirmed", "cancelled", "noshow"].includes(body.status)) return bad(res, "สถานะไม่ถูกต้อง");
      b.status = body.status;
      await audit(user, "status_change", `${b.code} → ${body.status}`);
    }
    if (body.date || body.time) { // = เลื่อนนัด
      const nd = body.date || b.date, nt = body.time || b.time;
      if (!isDateOk(nd)) return bad(res, "วันที่เลื่อนไม่ถูกต้อง");
      if (!slotsFor(b.serviceId).includes(nt)) return bad(res, "ช่วงเวลาไม่ถูกต้องสำหรับบริการนี้");
      if (b.status !== "cancelled" && remaining(b.serviceId, nd, nt, b.code) <= 0) return bad(res, "ช่วงเวลาที่เลื่อนไปเต็มแล้ว", 409);
      await audit(user, "reschedule", `${b.code} ${b.date} ${b.time} → ${nd} ${nt}`);
      b.date = nd; b.time = nt;
    }
    await store.updateBooking(b);
    return sendJson(res, 200, { booking: b });
  }
  if (p === "/api/upcoming" && req.method === "GET") {
    const service = url.searchParams.get("service");
    const from = todayISO(), to = datePlus(7);
    let list = db.bookings.filter((b) => b.date > from && b.date <= to && b.status !== "cancelled");
    if (service && service !== "all") list = list.filter((b) => b.serviceId === service);
    list.sort((a, b2) => (a.date + a.time).localeCompare(b2.date + b2.time));
    return sendJson(res, 200, { bookings: list, calls: db.calls });
  }
  if (p === "/api/calls" && req.method === "POST") {
    const body = await readBody(req);
    if (!db.bookings.some((b) => b.code === body.code)) return bad(res, "ไม่พบคิว", 404);
    await store.markCall(body.code, new Date().toISOString());
    await audit(user, "call_marked", body.code);
    return sendJson(res, 200, { ok: true });
  }
  if (p === "/api/report" && req.method === "GET") {
    const all = db.bookings;
    const byChannel = ["online", "walkin", "agency"].map((c) => ({
      ch: c, total: all.filter((b) => b.source === c).length, confirmed: all.filter((b) => b.source === c && b.status === "confirmed").length,
    }));
    const agencies = {};
    for (const b of all) if (b.agencyCode) agencies[b.agencyCode] = (agencies[b.agencyCode] || 0) + 1;
    return sendJson(res, 200, { byChannel, agencies, total: all.length });
  }
  if (p === "/api/logs" && req.method === "GET") {
    if (!isAdmin) return bad(res, "forbidden", 403);
    return sendJson(res, 200, { logs: db.audit.slice(-100).reverse() });
  }
  if (p === "/api/export.csv" && req.method === "GET") {
    const date = url.searchParams.get("date") || todayISO();
    const rows = db.bookings.filter((b) => b.date === date).sort((a, b2) => a.time.localeCompare(b2.time));
    const esc2 = (v) => {
      let s = String(v ?? "");
      // กัน CSV/formula injection ใน Excel: ขึ้นต้นด้วย = + - @ ให้เติม ' ข้างหน้า
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replaceAll('"', '""')}"`;
    };
    const csv = "\uFEFF" + ["เวลา", "คิวที่", "รหัส", "ชื่อ", "เบอร์โทร", "บริการ", "รายการ", "ช่องทาง", "ตัวแทน", "สิทธิ์", "สถานะ", "หมายเหตุ"].join(",") + "\n" +
      rows.map((b) => {
        const s = svc(b.serviceId) || { name: "บริการที่ถูกลบ" };
        const item = (s.items || []).find((i) => i.id === b.itemId);
        const st = { pending: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก", noshow: "ไม่มาตามนัด" }[b.status] || b.status;
        return [b.time, b.qno, b.code, b.name, b.phone, s.name, item ? item.name : "", b.source, b.agencyCode || "", b.rights, st, b.note].map(esc2).join(",");
      }).join("\n");
    await audit(user, "export_csv", date);
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="queue-${date}.csv"`, "Cache-Control": "no-store" });
    return res.end(csv);
  }

  // ---- จัดการบริการ (admin) ----
  if (p === "/api/services" && req.method === "PUT") {
    if (!isAdmin) return bad(res, "forbidden", 403);
    const body = await readBody(req);
    if (!Array.isArray(body.services) || !body.services.length) return bad(res, "รายการบริการไม่ถูกต้อง");
    for (const s of body.services) {
      if (!s.id || !String(s.name || "").trim() || !Array.isArray(s.items) || !s.items.length) return bad(res, `ข้อมูลบริการ "${s.name || s.id}" ไม่ครบ (ต้องมีชื่อและรายการย่อยอย่างน้อย 1)`);
      if (s.slots && (!Array.isArray(s.slots) || !s.slots.length || s.slots.some((t) => !/^\d{2}:\d{2}$/.test(t)))) return bad(res, "รูปแบบช่วงเวลาของบริการไม่ถูกต้อง");
      if (s.capacity != null && (!(Number(s.capacity) >= 1) || Number(s.capacity) > 99)) return bad(res, "ความจุต่อช่วงเวลาต้องเป็น 1–99");
    }
    db.services = body.services;
    await store.replaceServices();
    await audit(user, "services_update", body.services.map((s) => s.name).join(", "));
    return sendJson(res, 200, { services: db.services });
  }

  return bad(res, "not found", 404);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url.replace(/^\/{2,}/, "/"), "http://x");
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    // static — ถ้า build แบบไฟล์เดียว จะใช้ไฟล์ที่ฝังในตัว (globalThis.__EMBEDDED_ASSETS) ก่อนหาจากดิสก์
    let file = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    if (!path.extname(file)) file = file.replace(/\/+$/, "") + ".html"; // /admin → /admin.html
    const full = path.normalize(path.join(PUBLIC_DIR, file));
    if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    const ASSETS = globalThis.__EMBEDDED_ASSETS;
    const key = file.replace(/^\//, "");
    if (ASSETS && Object.prototype.hasOwnProperty.call(ASSETS, key)) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      return res.end(ASSETS[key]);
    }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
      res.end(data);
    });
  } catch (e) {
    console.error(e);
    try { sendJson(res, 500, { error: "internal error" }); } catch {}
  }
});

// เริ่มระบบ: เชื่อมต่อที่เก็บข้อมูลตามโหมดที่ตั้ง (env STORAGE) แล้วจึงเปิดพอร์ต
(async () => {
  try {
    const info = await store.init();
    console.log("[store] โหมดเก็บข้อมูล: " + info);
    server.listen(PORT, () => console.log(`ระบบจองคิวพร้อมใช้งาน → http://localhost:${PORT} (หน้าเจ้าหน้าที่ /login.html)`));
  } catch (e) {
    console.error("[store] เชื่อมต่อที่เก็บข้อมูลไม่สำเร็จ: " + e.message);
    process.exit(1);
  }
})();
