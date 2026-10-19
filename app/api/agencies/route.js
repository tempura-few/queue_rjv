import { NextResponse } from "next/server";
import core from "@/lib/core.js";
import { CONFIG } from "@/lib/config.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Master data ตัวแทน — ครั้งแรกที่เรียก (ยังไม่มีข้อมูล) ย้ายค่าจาก lib/config.js
// รวมกับโค้ดตัวแทนที่พบจริงในคิว (ที่เจ้าหน้าที่พิมพ์เข้ามาเอง) ให้กลายเป็นข้อมูลหลัก
async function ensureSeeded() {
  if (core.db.agencies.length) return false;
  const list = CONFIG.agencyCodes.map((a, i) => ({
    id: "ag-" + a.code.toLowerCase(), code: a.code, name: a.name, sort: i,
  }));
  const known = new Set(list.map((a) => a.code));
  for (const b of core.db.bookings) {
    if (!b.agencyCode || known.has(b.agencyCode)) continue;
    known.add(b.agencyCode);
    list.push({ id: "ag-" + b.agencyCode.toLowerCase(), code: b.agencyCode, name: "— ยังไม่ได้ลงทะเบียน —", contact: undefined });
  }
  core.db.agencies = list;
  await core.store.replaceAgencies();
  return true;
}

// แนบจำนวนคิวของแต่ละตัวแทน (นับจากคิวจริงทั้งหมด) + ว่ามีบัญชีล็อกอินหรือยัง
const hasAccount = (code) => core.db.users.some((u) => core.normRole(u.role) === "agency" && u.agencyCode === code);
function withCounts() {
  const counts = new Map();
  for (const b of core.db.bookings) if (b.agencyCode) counts.set(b.agencyCode, (counts.get(b.agencyCode) || 0) + 1);
  return core.db.agencies.map((a) => ({ ...a, bookings: counts.get(a.code) || 0, hasAccount: hasAccount(a.code) }));
}

// ชุดตัวอักษร gen รหัสผ่าน — ตัด 0/O/1/l/I ออกกันอ่านสลับ
const PW_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";
const genPassword = () => Array.from({ length: 8 }, () => PW_CHARS[Math.floor(Math.random() * PW_CHARS.length)]).join("");
// username จากรหัสตัวแทน (AG-004 → ag004) — ชนกับผู้ใช้เดิมก็ต่อท้าย -2, -3…
function genUsername(code) {
  let base = code.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 46);
  if (base.length < 3) base = "ag" + base;
  let name = base, i = 2;
  while (core.db.users.some((u) => u.username === name)) name = base + "-" + i++;
  return name;
}
// สร้างบัญชีตัวแทน (role agency ผูกรหัส) — รหัสผ่าน: แอดมินกำหนดเองหรือสุ่มให้ — คืนข้อมูลรหัสให้แสดงต่อแอดมินครั้งเดียว
async function createAgencyAccount(code, name, password) {
  const username = genUsername(code);
  const pw = password && password.length >= 6 ? password : genPassword();
  await core.store.addUser(core.store.makeUser(username, name || code, pw, "agency", code));
  return { code, username, password: pw };
}

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "ข้อมูลตัวแทน — เฉพาะเจ้าหน้าที่โรงพยาบาล" }, { status: 403 });
  const seeded = await ensureSeeded();
  if (seeded) await core.audit(user, "agencies_seed", `ย้ายข้อมูลตัวแทนเริ่มต้น ${core.db.agencies.length} รายเข้าฐานข้อมูล`);
  return NextResponse.json({ agencies: withCounts() });
}

export async function PUT(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "ข้อมูลตัวแทน — เฉพาะเจ้าหน้าที่โรงพยาบาล" }, { status: 403 });
  if (!core.can(user.role, "agency.manage")) return NextResponse.json({ error: "จัดการข้อมูลตัวแทน — เฉพาะฝ่ายขายและผู้ดูแลระบบ" }, { status: 403 });
  await ensureSeeded();
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.agencies)) return NextResponse.json({ error: "รายการตัวแทนไม่ถูกต้อง" }, { status: 400 });
  const old = new Map(core.db.agencies.map((a) => [a.code, a]));
  const seen = new Set();
  const list = [];
  const pwByCode = new Map(); // รหัสผ่านที่แอดมินกำหนดเอง (ต่อรหัสตัวแทน) — ไม่ส่งมา = สุ่มให้
  const pwOf = (v) => String(v || "").trim();
  const checkPw = (code, pw) => { if (pw && pw.length < 6) throw Object.assign(new Error(`รหัสผ่านบัญชีตัวแทน ${code} ต้องยาวอย่างน้อย 6 ตัวอักษร`), { status: 400 }); };
  for (const a of body.agencies) {
    // normalize เฉพาะ trim + พิมพ์ใหญ่ (ปลอดภัย) — อักขระอื่นที่นอกเหนือ A-Z 0-9 ขีด ปฏิเสธทันที ไม่ตัดทิ้งเงียบ ๆ
    const code = String(a.code || "").trim().toUpperCase().slice(0, 20);
    const name = String(a.name || "").trim().slice(0, 100);
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) return NextResponse.json({ error: `รหัสตัวแทน "${a.code}" ไม่ถูกต้อง (A-Z 0-9 ขีด 2–20 ตัว)` }, { status: 400 });
    if (seen.has(code)) return NextResponse.json({ error: `รหัสตัวแทน ${code} ซ้ำในรายการ` }, { status: 400 });
    if (!name) return NextResponse.json({ error: `ตัวแทน ${code} ต้องมีชื่อ` }, { status: 400 });
    const pw = pwOf(a.password);
    try { checkPw(code, pw); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status }); }
    if (pw) pwByCode.set(code, pw);
    seen.add(code);
    // รหัสห้ามแก้หลังสร้าง (คิวเก่าอ้างด้วยรหัส) — ถ้ารหัสตรงกับของเดิมให้ใช้ id เดิมต่อ
    list.push({
      id: (old.get(code) && old.get(code).id) || "ag-" + code.toLowerCase() + "-" + Date.now().toString(36),
      code, name,
      contact: String(a.contact || "").trim().slice(0, 120) || undefined,
      active: a.active === false ? false : undefined,
    });
  }
  const removed = [...old.keys()].filter((c) => !seen.has(c));
  core.db.agencies = list;
  await core.store.replaceAgencies();
  // gen บัญชีล็อกอินให้ตัวแทนอัตโนมัติ — ทุกรหัสที่เพิ่มใหม่ + รหัสเดิมที่ขอผ่าน genFor (ยังไม่มีบัญชีเท่านั้น)
  // genFor รับทั้ง "CODE" และ {code, password} (แอดมินกำหนดรหัสผ่านเอง)
  const genForCodes = new Set();
  for (const g of Array.isArray(body.genFor) ? body.genFor : []) {
    const item = typeof g === "string" ? { code: g } : g;
    const code = String(item.code || "").trim().toUpperCase();
    const pw = pwOf(item.password);
    try { checkPw(code, pw); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.status }); }
    if (pw) pwByCode.set(code, pw);
    genForCodes.add(code);
  }
  const wantGen = [...new Set([...list.filter((a) => !old.has(a.code)).map((a) => a.code), ...[...genForCodes].filter((c) => seen.has(c))])];
  const credentials = [];
  for (const code of wantGen) {
    if (hasAccount(code)) continue;
    const a = list.find((x) => x.code === code);
    credentials.push(await createAgencyAccount(code, a && a.name, pwByCode.get(code)));
  }
  await core.audit(user, "agencies_update", `${list.length} รายการ` + (removed.length ? ` (ลบ ${removed.join(", ")})` : "") + (credentials.length ? ` · สร้างบัญชี ${credentials.map((c) => c.username).join(", ")}` : ""));
  // credentials (รหัสผ่าน) ตอนกลับครั้งเดียวจากการสร้าง — ครั้งถัดไปไม่มีอีก แอดมินต้องเก็บไว้ส่งตัวแทน
  return NextResponse.json({ agencies: withCounts(), credentials });
}
