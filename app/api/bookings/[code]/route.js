import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "บัญชีตัวแทนดูและจองได้อย่างเดียว — แก้ไข/เลื่อน/ยกเลิกติดต่อเจ้าหน้าที่โรงพยาบาล" }, { status: 403 });
  const { code } = await params;
  const b = core.db.bookings.find((x) => x.code === code);
  if (!b) return NextResponse.json({ error: "ไม่พบคิวนี้" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (body.status) {
    if (!["pending", "confirmed", "cancelled", "noshow"].includes(body.status))
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    b.status = body.status;
    await core.audit(user, "status_change", `${b.code} → ${b.status}`);
  }
  if (body.date || body.time) { // = เลื่อนนัด
    const nd = body.date || b.date, nt = body.time || b.time;
    if (!core.isDateOk(nd)) return NextResponse.json({ error: "วันที่เลื่อนไม่ถูกต้อง" }, { status: 400 });
    if (!core.dayOpenOn(core.svc(b.serviceId), nd))
      return NextResponse.json({ error: `วันที่เลื่อนไปไม่ใช่วันให้บริการของ "${core.svc(b.serviceId).name}" (เปิดเฉพาะวัน ${core.daysLabel(core.svc(b.serviceId))})` }, { status: 400 });
    if (!core.slotsForDate(b.serviceId, nd).includes(nt)) return NextResponse.json({ error: "ช่วงเวลาไม่ถูกต้องสำหรับบริการนี้" }, { status: 400 });
    if (b.status !== "cancelled" && core.remaining(b.serviceId, nd, nt, b.code) <= 0)
      return NextResponse.json({ error: "ช่วงเวลาที่เลื่อนไปเต็มแล้ว" }, { status: 409 });
    await core.audit(user, "reschedule", `${b.code} ${b.date} ${b.time} → ${nd} ${nt}`);
    b.date = nd; b.time = nt;
  }
  await core.store.updateBooking(b);
  return NextResponse.json({ booking: b });
}

export async function DELETE(request, { params }) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "บัญชีตัวแทนดูและจองได้อย่างเดียว" }, { status: 403 });
  const { code } = await params;
  const b = core.db.bookings.find((x) => x.code === code);
  if (!b) return NextResponse.json({ error: "ไม่พบคิวนี้" }, { status: 404 });
  if (b.status === "cancelled") return NextResponse.json({ error: "คิวนี้ยกเลิกไปแล้ว" }, { status: 400 });
  b.status = "cancelled";
  await core.store.updateBooking(b);
  await core.audit(user, "status_change", `${b.code} → cancelled`);
  return NextResponse.json({ ok: true });
}
