import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// เมนู "ประวัติการใช้งาน" (แยกเป็นแท็บของตัวเอง) — คืนทั้งก้อนที่เก็บไว้ (store ค็อปที่ 500 รายการอยู่แล้ว)
// ใหม่สุดก่อน แล้วให้หน้าหลังบ้านกรอง/แบ่งหน้าฝั่ง client (ข้อมูลจำกัด เปลี่ยนตัวกรองได้ทันทีไม่ต้อง refetch)
export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "logs.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ logs: core.db.audit.slice(-500).reverse() });
}
