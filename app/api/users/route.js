import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// จัดการบัญชีเจ้าหน้าที่ — เฉพาะ admin (สิทธิ์ users.manage)
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,50}$/;
const ROLE_ORDER = { admin: 0, sale: 1, cs: 2, agency: 3 };
const bad = (error) => NextResponse.json({ error }, { status: 400 });
const pub = (u) => ({ id: u.id, username: u.username, name: u.name, role: core.normRole(u.role) || u.role, agencyCode: u.agencyCode || null });
const adminCount = () => core.db.users.filter((u) => core.normRole(u.role) === "admin").length;

// ตรวจฟิลด์ร่วมทั้งสร้าง/แก้ไข — existingUser = null สำหรับสร้างใหม่ (รหัสผ่านจำเป็น)
function validate(body, existingUser) {
  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim();
  const role = core.normRole(String(body.role || ""));
  const password = String(body.password || "");
  const agencyCode = String(body.agencyCode || "").toUpperCase().trim();
  if (!name || name.length > 100) return { ok: false, error: "กรุณากรอกชื่อ-นามสกุล (ยาวไม่เกิน 100 ตัวอักษร)" };
  if (!USERNAME_RE.test(username)) return { ok: false, error: "ชื่อผู้ใช้ต้องเป็นตัวอังกฤษ ตัวเลข จุด ขีดล่าง หรือขีดกลาง ยาว 3–50 ตัวอักษร" };
  if (!role) return { ok: false, error: "สิทธิ์ไม่ถูกต้อง (เลือก admin / sale / cs / agency)" };
  if (core.db.users.some((u) => u.username === username && u !== existingUser)) return { ok: false, error: "มีชื่อผู้ใช้นี้อยู่แล้ว: " + username };
  if (password && password.length < 6) return { ok: false, error: "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร" };
  if (!existingUser && !password) return { ok: false, error: "กรุณาตั้งรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)" };
  // บัญชีตัวแทน: ต้องผูกกับรหัสตัวแทนที่มีใน master data เสมอ (บัญชีอื่นไม่ผูก)
  if (role === "agency") {
    if (!/^[A-Z0-9-]{2,20}$/.test(agencyCode)) return { ok: false, error: "บัญชีตัวแทนต้องเลือกรหัสตัวแทนก่อน" };
    if (core.db.agencies.length && !core.db.agencies.some((a) => a.code === agencyCode))
      return { ok: false, error: `ไม่พบรหัสตัวแทน ${agencyCode} ในข้อมูลหลัก — เพิ่มที่เมนู "ตัวแทน" ก่อน` };
  }
  return { ok: true, fields: { name, username, role, password, agencyCode: role === "agency" ? agencyCode : undefined } };
}

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "users.manage")) return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบที่จัดการผู้ใช้ได้" }, { status: 403 });
  const users = [...core.db.users].sort((a, b) =>
    (ROLE_ORDER[core.normRole(a.role)] ?? 9) - (ROLE_ORDER[core.normRole(b.role)] ?? 9) || a.username.localeCompare(b.username));
  return NextResponse.json({ users: users.map(pub) });
}

export async function POST(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "users.manage")) return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบที่จัดการผู้ใช้ได้" }, { status: 403 });
  const v = validate(await request.json().catch(() => ({})), null);
  if (!v.ok) return bad(v.error);
  const u = core.store.makeUser(v.fields.username, v.fields.name, v.fields.password, v.fields.role, v.fields.agencyCode);
  await core.store.addUser(u);
  await core.audit(user, "user_create", `${u.username} (${u.name}) สิทธิ์ ${u.role}` + (u.agencyCode ? ` ตัวแทน ${u.agencyCode}` : ""));
  return NextResponse.json({ user: pub(u) });
}

export async function PATCH(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "users.manage")) return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบที่จัดการผู้ใช้ได้" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const target = core.db.users.find((u) => u.id === body.id);
  if (!target) return bad("ไม่พบผู้ใช้นี้ (อาจถูกลบไปแล้ว — รีเฟรชหน้าจอใหม่)");
  const v = validate(body, target);
  if (!v.ok) return bad(v.error);
  // กันปลดสิทธิ์ admin คนสุดท้าย — ระบบจะไม่มีใครจัดการผู้ใช้ได้เลย
  if (core.normRole(target.role) === "admin" && v.fields.role !== "admin" && adminCount() <= 1)
    return bad("ต้องมีผู้ดูแลระบบ (admin) อย่างน้อย 1 คน — เพิ่ม admin คนใหม่ก่อนจึงจะเปลี่ยนสิทธิ์คนนี้ได้");
  target.name = v.fields.name;
  target.username = v.fields.username;
  target.role = v.fields.role;
  target.agencyCode = v.fields.agencyCode;
  if (v.fields.password) core.setPassword(target, v.fields.password); // ไม่ส่งรหัสผ่านมา = คงรหัสเดิม
  await core.store.updateUser(target);
  await core.audit(user, "user_update", `${target.username} (${target.name}) สิทธิ์ ${target.role}` + (target.agencyCode ? ` ตัวแทน ${target.agencyCode}` : "") + (v.fields.password ? " · ตั้งรหัสผ่านใหม่" : ""));
  return NextResponse.json({ user: pub(target) });
}

export async function DELETE(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "users.manage")) return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบที่จัดการผู้ใช้ได้" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  const target = core.db.users.find((u) => u.id === id);
  if (!target) return bad("ไม่พบผู้ใช้นี้");
  if (target.id === user.id) return bad("ลบบัญชีที่กำลังใช้อยู่เองไม่ได้");
  if (core.normRole(target.role) === "admin" && adminCount() <= 1)
    return bad("ต้องมีผู้ดูแลระบบ (admin) อย่างน้อย 1 คน");
  await core.store.deleteUser(target.id);
  await core.audit(user, "user_delete", `${target.username} (${target.name})`);
  return NextResponse.json({ ok: true });
}
