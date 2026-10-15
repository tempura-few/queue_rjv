import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  const list = user ? core.db.services : core.db.services.filter((s) => s.active !== false);
  return NextResponse.json({ services: list });
}

export async function PUT(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user || !core.can(user.role, "services.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.services) || !body.services.length)
    return NextResponse.json({ error: "รายการบริการไม่ถูกต้อง" }, { status: 400 });
  for (const s of body.services) {
    if (!s.id || !String(s.name || "").trim())
      return NextResponse.json({ error: `ข้อมูลบริการ "${s.name || s.id}" ไม่ครบ (ต้องมีชื่อ)` }, { status: 400 });
    if (s.items != null && !Array.isArray(s.items))
      return NextResponse.json({ error: "รายการย่อยต้องเป็นรายการ (array)" }, { status: 400 }); // ไม่มีรายการย่อย (0 รายการ) ก็ได้ — optional
    if (s.bookingMode != null && !["slot", "callback"].includes(s.bookingMode))
      return NextResponse.json({ error: "ประเภทบริการไม่ถูกต้อง (slot = เลือกวัน–เวลา / callback = ไม่มีเวลานัด)" }, { status: 400 });
    if (s.slots && (!Array.isArray(s.slots) || !s.slots.length || s.slots.some((t) => !/^\d{2}:\d{2}$/.test(t))))
      return NextResponse.json({ error: "รูปแบบช่วงเวลาของบริการไม่ถูกต้อง" }, { status: 400 });
    // เวลารายวัน (optional): { "1": ["08:00", ...], ... } คีย์ 0–6 ตาม getDay() — วันที่เว้นไว้/รายการว่าง = ไม่ให้บริการวันนั้น
    if (s.slotsByDay != null) {
      const okByDay = s.slotsByDay && typeof s.slotsByDay === "object" && !Array.isArray(s.slotsByDay) &&
        Object.keys(s.slotsByDay).every((k) => /^[0-6]$/.test(k)) &&
        Object.values(s.slotsByDay).every((arr) => Array.isArray(arr) && arr.every((t) => /^\d{2}:\d{2}$/.test(t)));
      if (!okByDay) return NextResponse.json({ error: "รูปแบบเวลารายวันไม่ถูกต้อง (คีย์ 0–6 ค่าเป็นรายการเวลา HH:MM)" }, { status: 400 });
      const anyOpen = Object.values(s.slotsByDay).some((arr) => arr.length);
      if (!anyOpen) return NextResponse.json({ error: "ต้องตั้งเวลาอย่างน้อย 1 วัน (รายวัน)" }, { status: 400 });
    }
    if (s.capacity != null && (!(Number(s.capacity) >= 1) || Number(s.capacity) > 99))
      return NextResponse.json({ error: "ความจุต่อช่วงเวลาต้องเป็น 1–99" }, { status: 400 });
    // วันให้บริการ (optional): รับ 0–6 ตาม getDay() — ไม่ส่งมา = เปิดทุกวัน
    if (s.days != null) {
      const okDays = Array.isArray(s.days) && s.days.length >= 1 && s.days.length <= 7 &&
        s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(s.days).size === s.days.length;
      if (!okDays) return NextResponse.json({ error: "วันให้บริการไม่ถูกต้อง (เลือกวัน อา–ส อย่างน้อย 1 วัน)" }, { status: 400 });
    }
  }
  core.db.services = body.services;
  await core.store.replaceServices();
  await core.audit(user, "services_update", body.services.map((s) => s.name).join(", "));
  return NextResponse.json({ services: core.db.services });
}
