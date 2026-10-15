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
  // ส่ง JWT กลับไปให้ frontend เก็บแล้วแนบมากับ header Authorization: Bearer … ในทุกคำขอ
  return NextResponse.json({ token: core.signToken(u), user: { username: u.username, name: u.name, role: u.role } });
}
