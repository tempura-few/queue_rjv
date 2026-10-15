import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ค้นรหัสจองแบบสาธารณะ — ตั้งใจส่งกลับแค่ข้อมูลจำเป็น ไม่มีชื่อ/เบอร์ผู้ป่วย (PDPA)
export async function GET(_request, { params }) {
  await core.ensureInit();
  const { code } = await params;
  const b = core.db.bookings.find((x) => x.code === code);
  if (!b) return NextResponse.json({ error: "ไม่พบรหัสการจองนี้" }, { status: 404 });
  const s = core.svc(b.serviceId) || { icon: "❓", name: "บริการที่ถูกลบ" };
  return NextResponse.json({ booking: { code: b.code, qno: b.qno, service: s.name, serviceEn: s.nameEn || s.name, icon: s.icon, date: b.date, time: b.time, status: b.status, agencyCode: b.agencyCode, source: b.source } });
}
