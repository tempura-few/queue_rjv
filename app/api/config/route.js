import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await core.ensureInit();
  return NextResponse.json({
    daysAhead: core.daysAhead(),
    rights: core.rightsAll(), // [{th, en}] — หน้าจองใช้แสดง dropdown ตามภาษา (ค่าที่ส่มไปบันทึกคือ th)
    upcoming: { days: core.upcomingDays(), includeToday: core.upcomingIncludeToday(), includeNoshow: core.upcomingIncludeNoshow() },
    channels: core.channelsAll(), // รายการช่องทางผู้ป่วย (master data) ใช้ในหน้ารับคิว walk-in
  });
}
