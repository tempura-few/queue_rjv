import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PDPA: เปิดดูข้อมูลติดต่อ "ค่าเต็ม" ทีละรายการ (เช่น เจ้าหน้าที่ต้องโทรยืนยันนัด)
// — บังคับ login, ตัวแทนเห็นเฉพาะคิวของตัวเอง, และ "บันทึก audit ทุกครั้ง" ว่าใครเปิดดูคิวไหน
export async function GET(request, { params }) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { code } = await params;
  const b = core.db.bookings.find((x) => x.code === code);
  if (!b) return NextResponse.json({ error: "ไม่พบคิวนี้" }, { status: 404 });
  if (core.isAgency(user) && b.agencyCode !== user.agencyCode)
    return NextResponse.json({ error: "บัญชีตัวแทนเห็นเฉพาะคิวของตัวเอง" }, { status: 403 });
  await core.audit(user, "pii_reveal", `${b.code}`);
  return NextResponse.json(
    { code: b.code, phone: b.phone || "", email: b.email || "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
