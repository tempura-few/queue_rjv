import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// บอกเวอร์ชัน (git commit) ของ build ที่กำลังรัน — ใช้ตรวจว่า deploy ตัวใหม่ขึ้นจริงไหม
// ค่ามาจาก ARG/ENV GIT_COMMIT ที่ CI ใส่ตอน docker build (dev รันโดยตรงจะเป็น null)
export async function GET() {
  return NextResponse.json({ commit: process.env.GIT_COMMIT || null });
}
