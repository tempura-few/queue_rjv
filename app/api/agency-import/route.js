import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// นำเข้าคิวจากไฟล์ (ขั้นตอนที่ 2: บันทึกจริง — ตรวจซ้ำทุกแถวอีกครั้งกันความจุเปลี่ยนไป)
export async function POST(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "agency.manage")) return NextResponse.json({ error: "นำเข้าคิวจากไฟล์ตัวแทน — เฉพาะฝ่ายขายและผู้ดูแลระบบ" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const agencyCode = String(body.agencyCode || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!agencyCode) return NextResponse.json({ error: "กรุณาใส่รหัสตัวแทน" }, { status: 400 });
  const raws = (Array.isArray(body.rows) ? body.rows : [])
    .filter((r) => r && typeof r === "object")
    .map((r, i) => ({ rowNo: Number(r.rowNo) || i + 2, date: String(r.date || ""), time: String(r.time || ""),
      service: String(r.service || ""), item: String(r.item || ""), name: String(r.name || ""),
      phone: String(r.phone || ""), email: String(r.email || ""), rights: String(r.rights || ""), note: String(r.note || "").slice(0, 200) }))
    .slice(0, core.IMPORT_MAX_ROWS);
  if (!raws.length) return NextResponse.json({ error: "ไม่มีรายการที่จะนำเข้า" }, { status: 400 });
  const analyzed = core.analyzeImportRows(raws);
  const made = [], skipped = [];
  for (const a of analyzed) {
    if (!a.ok) { skipped.push({ row: a.row, name: a.name, error: a.error }); continue; }
    const res2 = core.createBooking(user, {
      serviceId: a.serviceId, itemId: a.itemId, date: a.date, time: a.time,
      name: a.name, phone: a.phone || "0900000000", email: a.email || undefined, rights: a.rights,
      agencyCode, source: "agency",
      note: a.note || `นำเข้าจากไฟล์โดยตัวแทน ${agencyCode}`,
      status: "confirmed",
    });
    if (!res2.ok) { skipped.push({ row: a.row, name: a.name, error: res2.error }); continue; }
    if (!a.phone) res2.booking.phone = "-"; // ตัวแทนไม่ระบุเบอร์ — เก็บเป็นขีดแทนเบอร์ปลอม
    await core.store.addBooking(res2.booking);
    made.push(res2.booking);
  }
  await core.audit(user, "agency_import", `${agencyCode} ✓${made.length} คิว ✗ข้าม ${skipped.length}`);
  return NextResponse.json({ count: made.length, codes: made.map((b) => b.code), firstDate: made.length ? made[0].date : "", skipped }, { status: 201 });
}
