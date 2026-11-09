import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";

// JWT เป็น stateless — ไม่มีสถานะฝั่ง server ให้ยกเลิก
// การออกจากระบบ = ลบ httpOnly cookie (ฝั่ง client จะล้าง token เก่าใน localStorage เอง ถ้ามี)
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(core.COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
