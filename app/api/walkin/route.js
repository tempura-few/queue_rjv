import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "รับคิวหน้าเคาน์เตอร์ — เฉพาะเจ้าหน้าที่ (ตัวแทนใช้ปุ่ม เพิ่มคิวลูกค้า)" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const s0 = core.svc(body.serviceId);
  if (!body.itemId && s0 && s0.items && s0.items.length) body.itemId = s0.items[0].id;
  // วันที่: ใช้ที่เจ้าหน้าที่เลือก (ค่าเริ่มต้นหน้าเว็บคือวันนี้) — ตรวจช่วงเวลาเปิดจอง/รูปแบบวันที่ต่อใน createBooking
  body.date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? body.date : core.todayISO();
  body.status = "confirmed";
  body.source = String(body.agencyCode || "").trim() ? "agency" : "walkin";
  body.note = body.note || "ลงทะเบียนหน้าเคาน์เตอร์";
  // ผู้ป่วย walk-in บางราย (ต่างชาติ) ไม่มีทั้งเบอร์และอีเมล — ผ่านด้วยเบอร์แฝงแล้วเปลี่ยนเป็น "-" (แพทเทิร์นเดียวกับรับคิวชุด)
  const noContact = !String(body.phone || "").trim() && !String(body.email || "").trim();
  if (noContact) body.phone = "0900000000";
  const r = core.createBooking(user, body, { walkin: true }); // walk-in: รับได้แม้ออนไลน์เต็ม/เวลาผ่านแล้ว
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (noContact) r.booking.phone = "-";
  await core.store.addBooking(r.booking);
  await core.audit(user, "booking_walkin", `${r.booking.code} ${r.booking.name}`);
  return NextResponse.json({ code: r.booking.code, qno: r.booking.qno }, { status: 201 });
}
