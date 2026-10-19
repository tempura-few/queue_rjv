import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ภาพรวมที่นั่งคงเหลือรายวันของทุกบริการ สำหรับหน้า "ปฏิทินว่าง" หลังบ้าน
// GET /api/calendar?from=ปปปป-ดด-วว&to=ปปปป-ดด-วว (สูงสุด 62 วัน)
// คืน { services: [...], days: { "ปปปป-ดด-วว": { <svcId>: { open, total, booked, left } } } }
export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "ปฏิทินว่าง — เฉพาะเจ้าหน้าที่โรงพยาบาล" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from"), to = sp.get("to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || from > to)
    return NextResponse.json({ error: "รูปแบบช่วงวันที่ไม่ถูกต้อง (ปปปป-ดด-วว)" }, { status: 400 });
  if (Math.round((new Date(to + "T00:00:00") - new Date(from + "T00:00:00")) / 864e5) > 61)
    return NextResponse.json({ error: "ช่วงวันที่ยาวเกินไป (สูงสุด 62 วัน)" }, { status: 400 });

  const services = core.db.services.filter((s) => s.active !== false);

  // นับคิวที่ยังไม่ยกเลิกของแต่ละ บริการ|วัน ครั้งเดียวจากทั้งก้อน (เร็วกว่าวนซ้ำทุกวัน)
  const bookedMap = new Map();
  for (const b of core.db.bookings) {
    if (b.status === "cancelled" || !b.date) continue;
    const k = b.serviceId + "|" + b.date;
    bookedMap.set(k, (bookedMap.get(k) || 0) + 1);
  }

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const out = {
    services: services.map((s) => ({
      id: s.id, icon: s.icon, name: s.name,
      slotCount: core.slotsFor(s.id).length, cap: s.capacity || 4,
    })),
    bookUntil: core.datePlus(core.daysAhead()), // เกินวันนี้ = ยังไม่เปิดให้จองล่วงหน้า (แสดงเป็นภาพรวมความจุ)
    days: {},
  };
  for (let d = new Date(from + "T00:00:00"); ; d.setDate(d.getDate() + 1)) {
    const dateISO = iso(d);
    const isToday = dateISO === core.todayISO();
    const nowStr = core.nowHHMM();
    const per = {};
    for (const s of services) {
      const open = core.dayOpenOn(s, dateISO); // วันที่บริการไม่เปิด = ที่นั่ง 0 ไม่ใช่เต็ม
      const slotTimes = core.slotsForDate(s.id, dateISO); // เวลารายวันของวันที่คำนวณ (หรือชุดเดียวทุกวัน)
      const total = open ? (s.capacity || 4) * slotTimes.length : 0;
      const booked = open ? (bookedMap.get(s.id + "|" + dateISO) || 0) : 0;
      // รายละเอียดรายช่วงเวลา (ใช้แสดงใน popup เจาะดูวัน — ไม่ผูกกับช่วงเปิดจองล่วงหน้าแบบ /api/availability)
      const slots = open ? slotTimes.map((t) => ({
        t,
        left: core.remaining(s.id, dateISO, t),
        past: isToday && t.replace(":", "") <= nowStr, // ช่วงเวลาที่ผ่านมาแล้วของวันนี้
      })) : [];
      // ช่วงเวลาเร็วสุดที่ยังจองได้ — แสดงในชิปปฏิทิน
      let next = null;
      for (const x of slots) { if (!x.past && x.left > 0) { next = x.t; break; } }
      per[s.id] = { open, total, booked, left: Math.max(0, total - booked), next, slots };
    }
    out.days[dateISO] = per;
    if (dateISO === to) break;
  }
  return NextResponse.json(out);
}
