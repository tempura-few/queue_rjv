import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const service = sp.get("service");
  // ตัวกรองเฉพาะหน้านี้ (ต่างจากหน้าอื่น): เวลาแบบสัมพัทธ์ ?when=today|tomorrow|week และสถานะโทร ?call=pending|called
  const when = sp.get("when");
  const call = sp.get("call");
  // แบ่งหน้าแบบมาตรฐาน: ?page=2&pageSize=20 (สูงสุด 500/หน้า) — รับ limit/offset เดิมได้ด้วย
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") || sp.get("limit")) || 300));
  const pageParam = Number(sp.get("page")) || 0;
  const offset = pageParam >= 1 ? (pageParam - 1) * pageSize : Math.max(0, Number(sp.get("offset")) || 0);
  // ช่วงวันตามค่าตั้งของระบบ (/api/settings → แท็บการตั้งค่า) — แต่ถ้าเลือกช่วง "วันนี้/พรุ่งนี้/7 วัน" ชัดเจน ใช้ตามที่เลือก
  const today = core.todayISO();
  let from, to;
  if (when === "today") { from = to = today; }
  else if (when === "tomorrow") { from = to = core.datePlus(1); }
  else if (when === "week") { from = today; to = core.datePlus(6); }
  else {
    from = core.upcomingIncludeToday() ? today : core.datePlus(1);
    to = core.datePlus(core.upcomingDays());
  }
  const includeNoshow = core.upcomingIncludeNoshow();
  let list = core.db.bookings.filter((b) => b.date >= from && b.date <= to && b.status !== "cancelled" && (includeNoshow || b.status !== "noshow"));
  if (service && service !== "all") list = list.filter((b) => b.serviceId === service);
  if (call === "pending") list = list.filter((b) => !core.db.calls[b.code]);
  else if (call === "called") list = list.filter((b) => !!core.db.calls[b.code]);
  list.sort((a, b2) => (a.date + a.time).localeCompare(b2.date + b2.time));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const usePageMode = pageParam >= 1;
  const page = usePageMode ? Math.min(pageParam, totalPages) : Math.floor(offset / pageSize) + 1;
  const start = usePageMode ? (page - 1) * pageSize : offset;
  const rowsOut = list.slice(start, start + pageSize);
  return NextResponse.json({
    bookings: rowsOut,
    calls: core.db.calls,
    pagination: {
      page, pageSize, total, totalPages,
      hasNext: start + pageSize < total, hasPrev: start > 0,
      from: rowsOut.length ? start + 1 : 0,
      to: start + rowsOut.length,
    },
  });
}
