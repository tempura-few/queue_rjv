import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PDPA (right to erasure): ลบข้อมูลส่วนบุคคลของ 1 คิวตามคำขอผู้ป่วย — admin เท่านั้น
// ทำเป็น "anonymize" แทนการลบแถวทิ้ง: คง code/qno/date/status ไว้เพื่อสถิติคิวและการเงิน
// แต่กวาดชื่อ/เบอร์/อีเมล/หมายเหตุ/ความยินยอมออกทั้งหมด (ย้อนไม่ได้) + audit ทุกครั้ง
export async function POST(request, { params }) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "data.erase"))
    return NextResponse.json({ error: "ลบข้อมูลผู้ป่วย — เฉพาะผู้ดูแลระบบ (admin)" }, { status: 403 });
  const { code } = await params;
  const b = core.db.bookings.find((x) => x.code === code);
  if (!b) return NextResponse.json({ error: "ไม่พบคิวนี้" }, { status: 404 });
  if (b.name === "(ลบตามคำขอ PDPA)")
    return NextResponse.json({ error: "คิวนี้ถูกลบข้อมูลไปแล้ว" }, { status: 400 });
  b.name = "(ลบตามคำขอ PDPA)";
  // ล้างค่าแต่ "คงรูปฟิลด์" ไว้ (ค่าว่าง) — ให้โค้ดที่อ่าน b.phone/b.note ทุกจุดยังทำงานได้
  b.phone = ""; b.email = ""; b.note = "";
  b.consentAt = ""; b.consentVia = "";
  b.erasedAt = new Date().toISOString();
  b.erasedBy = user.username;
  await core.store.updateBooking(b);
  delete core.db.calls[b.code]; // ประวัติการโทรผูกกับรหัสคิว — ลบทิ้งด้วย
  await core.audit(user, "booking_erase", `${b.code}`); // จดเฉพาะรหัสคิว ไม่จดชื่อ (ข้อมูลถูกลบแล้ว)
  return NextResponse.json({ ok: true, booking: core.publicBooking(b) });
}
