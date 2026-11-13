import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// เสิร์ฟรูปบริการ / รูปรายการย่อย (เก็บเป็น base64 data-URL ในข้อมูล) — แยกจาก /api/services
// เพื่อไม่ให้ base64 บวม payload ที่หน้าแรก/หน้าจอง/หลังบ้านดึงทุกโหลด
//   /api/service-image/<serviceId>            → รูปของบริการ
//   /api/service-image/<serviceId>?item=<id>  → รูปของรายการย่อย
// เป็น public: หน้าผู้ป่วย (การ์ดแพ็กเกจ/รายการ) ใช้ได้โดยไม่ต้องล็อกอิน
export async function GET(request, { params }) {
  await core.ensureInit();
  const { id } = await params;
  const itemId = request.nextUrl.searchParams.get("item");
  const s = core.db.services.find((x) => x.id === id);
  let img = "";
  if (itemId) {
    const it = s && Array.isArray(s.items) ? s.items.find((x) => x.id === itemId) : null;
    img = it && typeof it.image === "string" ? it.image : "";
  } else {
    img = s && typeof s.image === "string" ? s.image : "";
  }
  // รองรับเฉพาะ data-URL รูป: "data:<mime>;base64,<...>" — อย่างอื่นไม่ส่ง (กัน XSS/ข้อมูลแปลก)
  const m = img.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  let buf;
  try { buf = Buffer.from(m[2], "base64"); } catch { return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "no-store" } }); }
  if (!buf.length) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  // no-store: กันเบราว์เซอร์แคชรูปเก่าไว้ หลังเจ้าหน้าที่แก้รูปจากหลังบ้านต้องเห็นรูปใหม่ทันที
  return new NextResponse(buf, {
    headers: { "Content-Type": m[1], "Cache-Control": "no-store", "Content-Length": String(buf.length) },
  });
}
