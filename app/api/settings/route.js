import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user || !core.can(user.role, "settings.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const parts = [];
  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  // แต่ละฟิลด์ส่งมาเมื่อไหร่ก็ตรวจและบันทึกเฉพาะฟิลด์นั้น — ไม่ส่งก็คงค่าเดิม
  if (body.daysAhead !== undefined) {
    if (!intIn(Number(body.daysAhead), 1, 90))
      return NextResponse.json({ error: "ระยะเวลาเปิดจองล่วงหน้าต้องเป็นจำนวนเต็ม 1–90 วัน" }, { status: 400 });
    core.db.settings.daysAhead = Number(body.daysAhead);
    parts.push(`เปิดจองล่วงหน้า ${core.db.settings.daysAhead} วัน`);
  }
  if (body.upcomingDays !== undefined) {
    if (!intIn(Number(body.upcomingDays), 1, 90))
      return NextResponse.json({ error: "จำนวนวันของนัดที่กำลังจะถึงต้องเป็นจำนวนเต็ม 1–90 วัน" }, { status: 400 });
    core.db.settings.upcomingDays = Number(body.upcomingDays);
    parts.push(`นัดที่กำลังจะถึง ${core.db.settings.upcomingDays} วัน`);
  }
  if (body.upcomingIncludeToday !== undefined) {
    core.db.settings.upcomingIncludeToday = !!body.upcomingIncludeToday;
    parts.push(core.db.settings.upcomingIncludeToday ? "รวมวันนี้" : "ไม่รวมวันนี้");
  }
  if (body.upcomingIncludeNoshow !== undefined) {
    core.db.settings.upcomingIncludeNoshow = !!body.upcomingIncludeNoshow;
    parts.push(core.db.settings.upcomingIncludeNoshow ? "รวมไม่มาตามนัด" : "ไม่รวมไม่มาตามนัด");
  }

  if (body.rights !== undefined) {
    // สิทธิการรักษา: อาร์เรย์ [{th, en}] — th ต้องไม่ว่างและไม่ซ้ำ, en เว้นว่างได้ (สูงสุด 30 รายการ)
    const rows = Array.isArray(body.rights) ? body.rights : [];
    const cleaned = rows
      .map((r) => ({ th: String((r && r.th) || "").trim().slice(0, 60), en: String((r && r.en) || "").trim().slice(0, 60) }))
      .filter((r) => r.th);
    if (!cleaned.length || cleaned.length > 30)
      return NextResponse.json({ error: "สิทธิการรักษาต้องมีอย่างน้อย 1 รายการ (ไม่เกิน 30)" }, { status: 400 });
    if (new Set(cleaned.map((r) => r.th)).size !== cleaned.length)
      return NextResponse.json({ error: "ชื่อสิทธิการรักษา (ไทย) ซ้ำกัน กรุณาตรวจอีกครั้ง" }, { status: 400 });
    core.db.settings.rights = cleaned;
    parts.push(`สิทธิการรักษา ${cleaned.length} รายการ`);
  }

  if (body.channels !== undefined) {
    // ช่องทางผู้ป่วย (master data): อาร์เรย์ชื่อช่องทาง — ตัดช่องว่าง/ลบซ้ำ (สูงสุด 30 รายการ, ชื่อไม่เกิน 40 ตัวอักษร)
    const rows = Array.isArray(body.channels) ? body.channels : [];
    const cleaned = [...new Set(rows.map((c) => String(c || "").trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
    if (!cleaned.length) return NextResponse.json({ error: "ต้องมีช่องทางอย่างน้อย 1 รายการ" }, { status: 400 });
    core.db.settings.channels = cleaned;
    parts.push(`ช่องทางผู้ป่วย ${cleaned.length} รายการ`);
  }

  await core.store.saveSettings();
  await core.audit(user, "settings_update", parts.join(" · ") || "ไม่มีการเปลี่ยนค่า");
  return NextResponse.json({ settings: core.db.settings });
}
