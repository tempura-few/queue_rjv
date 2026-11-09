import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  await core.ensureInit();
  const ip = core.ipOf(request);
  if (core.isLoginLimited(ip))
    return NextResponse.json({ error: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองอีกครั้งใน 15 นาที" }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const u = core.db.users.find((x) => x.username === String(body.username || "").trim());
  if (!u || !core.checkPassword(u, String(body.password || ""))) {
    core.recordLoginFail(ip);
    await core.audit(null, "login_fail", "user: " + String(body.username || "").slice(0, 50) + " ip: " + ip);
    return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  core.clearLoginFails(ip); // ล็อกอินถูก — เคลียร์จำนวนครั้งที่ผิดของ IP นี้
  await core.audit(u, "login_ok", "");
  // PDPA/XSS: JWT อยู่ใน httpOnly cookie เป็นหลัก (JS อ่านไม่ได้ — กันถูกขโมยผ่าน XSS)
  // ยังคืน token ใน body ด้วยสำหรับ client เก่า/การใช้งานแบบ API (ควรเลิกใช้แล้วเก็บใน localStorage)
  const token = core.signToken(u);
  const res = NextResponse.json({ token, user: { username: u.username, name: u.name, role: u.role } });
  res.cookies.set(core.COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production", // บังคับ HTTPS ใน production (ห้ามส่ง cookie ผ่าน HTTP)
    maxAge: core.TOKEN_HOURS * 3600,
  });
  return res;
}
