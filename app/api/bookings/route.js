import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const date = sp.get("date");
  const from = sp.get("from");
  const to = sp.get("to");
  const service = sp.get("service");
  const agency = sp.get("agency");
  const q = (sp.get("q") || "").trim().toLowerCase();
  // กรองวันที่ 2 แบบ: ?date=วันเดียว หรือ ?from=...&to=... (ช่วง — ใส่ฝั่งเดียวก็ได้)
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)))
    return NextResponse.json({ error: "รูปแบบช่วงวันที่ไม่ถูกต้อง (ปปปป-ดด-วว)" }, { status: 400 });
  if (from && to && from > to)
    return NextResponse.json({ error: "วันเริ่มช่วงต้องมาก่อนวันสิ้นสุด" }, { status: 400 });
  // แบ่งหน้าแบบมาตรฐาน: ?page=2&pageSize=20 (สูงสุด 500/หน้า) — คืน pagination metadata ครบ
  // และยังรับ limit/offset แบบเดิมได้ (backward compatible)
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") || sp.get("limit")) || 200));
  const pageParam = Number(sp.get("page")) || 0;
  const offset = pageParam >= 1 ? (pageParam - 1) * pageSize : Math.max(0, Number(sp.get("offset")) || 0);
  let list = core.db.bookings;
  if (sp.get("callback") === "1") list = list.filter((b) => b.source === "callback"); // เฉพาะคำขอรอนัดหมาย (บริการไม่มีเวลานัด)
  else if (q) list = list.filter((b) => b.name.toLowerCase().includes(q) || b.phone.includes(q.replace(/\s/g, "")) || (b.email || "").toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || (b.agencyCode || "").toLowerCase().includes(q));
  else if (date) list = list.filter((b) => b.date === date);
  else if (from || to) list = list.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));
  if (agency && agency !== "all") list = list.filter((b) => b.agencyCode === agency); // กรองตามตัวแทน (ใช้ร่วมกับวันที่/ช่วงวันได้)
  if (service && service !== "all") list = list.filter((b) => b.serviceId === service);
  const status = sp.get("status");
  if (status && status !== "all") list = list.filter((b) => b.status === status);
  list = [...list].sort((a, b2) => (a.date + a.time).localeCompare(b2.date + b2.time));
  const count = (fn) => list.reduce((n, b) => n + (fn(b) ? 1 : 0), 0);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // โหมด page: ขอเกินหน้าสุดท้าย → clamp เป็นหน้าสุดท้าย (คืนข้อมูลหน้านั้น ไม่ใช่ชุดว่าง)
  // โหมด offset (เดิม): เลื่อนตรงตามที่ขอเสมอ
  const usePageMode = pageParam >= 1;
  const page = usePageMode ? Math.min(pageParam, totalPages) : Math.floor(offset / pageSize) + 1;
  const start = usePageMode ? (page - 1) * pageSize : offset;
  const rowsOut = list.slice(start, start + pageSize);
  return NextResponse.json({
    bookings: rowsOut,
    // โค้ดตัวแทนทั้งหมดที่พบในระบบ (รวมที่พิมพ์เองนอกลิสต์ config) — ใช้ทำตัวเลือก dropdown ตัวกรอง
    agencyCodes: [...new Set(core.db.bookings.filter((b) => b.agencyCode).map((b) => b.agencyCode))].sort(),
    stats: {
      total,
      online: count((b) => b.source === "online"), walkin: count((b) => b.source === "walkin"), agency: count((b) => b.source === "agency"),
      pending: count((b) => b.status === "pending"), confirmed: count((b) => b.status === "confirmed"),
    },
    pagination: {
      page, pageSize, total, totalPages,
      hasNext: start + pageSize < total, hasPrev: start > 0,
      // from/to สะท้อนแถวที่คืนจริงเสมอ (โหมด offset แบบเดิมก็ตรง)
      from: rowsOut.length ? start + 1 : 0,
      to: start + rowsOut.length,
    },
  });
}

export async function POST(request) {
  await core.ensureInit();
  if (core.rateLimited(core.ipOf(request)))
    return NextResponse.json({ error: "จองบ่อยเกินไป กรุณารอสักครู่ (จำกัด 10 ครั้ง/15 นาที)" }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  if (body.consent !== true) return NextResponse.json({ error: "กรุณายินยอมการเก็บข้อมูล (PDPA) ก่อนจอง" }, { status: 400 });
  // บริการประเภท "ไม่มีเวลานัด" — ไม่มีวัน/เวลา บันทึกเป็นคำขอรอ รพ. โทรกลับนัด
  const svcObj = core.svc(body.serviceId);
  if (svcObj && svcObj.bookingMode === "callback") {
    if (!body.itemId && svcObj.items && svcObj.items.length) body.itemId = svcObj.items[0].id;
    const r = core.createCallbackBooking(body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    await core.store.addBooking(r.booking);
    await core.audit(null, "callback_request", `${r.booking.code} ${r.booking.name}`);
    return NextResponse.json({ code: r.booking.code, qno: r.booking.qno, callback: true }, { status: 201 });
  }
  const r = core.createBooking(null, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await core.store.addBooking(r.booking);
  await core.audit(null, "booking_online", `${r.booking.code} ${r.booking.name}`);
  return NextResponse.json({ code: r.booking.code, qno: r.booking.qno }, { status: 201 });
}
