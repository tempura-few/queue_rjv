import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  // ฝ่ายขาย/แอดมิน รับคิวชุดแทนตัวแทนไหนก็ได้ · บัญชีตัวแทนรับคิวชุดของตัวเองได้ (รหัสผูกจากบัญชีเสมอ)
  if (!core.can(user.role, "agency.manage") && !core.isAgency(user)) return NextResponse.json({ error: "รับคิวเป็นชุด — เฉพาะฝ่ายขาย ผู้ดูแลระบบ และบัญชีตัวแทน" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const rows = (Array.isArray(body.rows) ? body.rows : [])
    .map((r) => ({ name: String(r.name || "").trim(), phone: String(r.phone || "").trim(), email: String(r.email || "").trim() }))
    .filter((r) => r.name);
  if (!rows.length) return NextResponse.json({ error: "ต้องมีรายชื่ออย่างน้อย 1 คน" }, { status: 400 });
  const agencyCode = core.isAgency(user)
    ? user.agencyCode
    : String(body.agencyCode || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!agencyCode) return NextResponse.json({ error: "กรุณาใส่รหัสตัวแทน" }, { status: 400 });
  const s = core.svc(body.serviceId);
  if (!s) return NextResponse.json({ error: "บริการไม่ถูกต้อง" }, { status: 400 });
  const left = core.remaining(body.serviceId, body.date, body.time);
  if (rows.length > left)
    return NextResponse.json({ error: `ที่นั่งเหลือ ${left} ที่เท่านั้น (ต้องการ ${rows.length}) — เลือกเวลาอื่นหรือแบ่งเป็นหลายช่วงเวลา` }, { status: 400 });
  const made = [];
  for (const r of rows) {
    const res2 = core.createBooking(user, {
      serviceId: body.serviceId, itemId: s.items && s.items.length ? s.items[0].id : undefined, date: body.date, time: body.time,
      name: r.name, phone: r.phone || "0900000000", email: r.email || undefined, rights: body.rights,
      agencyCode, source: "agency", note: `รับเป็นชุดจากตัวแทน ${agencyCode}`,
      status: "confirmed",
    });
    if (!res2.ok) return NextResponse.json({ error: `บันทึกไม่สำเร็จ (รายชื่อ ${r.name}): ${res2.error}` }, { status: res2.status });
    if (!r.phone) res2.booking.phone = "-"; // ตัวแทนไม่ระบุเบอร์ — เก็บเป็นขีดแทนเบอร์ปลอม
    await core.store.addBooking(res2.booking);
    made.push(res2.booking);
  }
  await core.audit(user, "booking_batch", `${agencyCode} × ${made.length} วันที่ ${body.date} ${body.time}`);
  return NextResponse.json({ count: made.length, codes: made.map((b) => b.code) }, { status: 201 });
}
