import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// JWT เป็น stateless — ไม่มีสถานะฝั่ง server ให้ยกเลิก การออกจากระบบ = ลบ token ที่ฝั่ง client
export async function POST() {
  return NextResponse.json({ ok: true });
}
