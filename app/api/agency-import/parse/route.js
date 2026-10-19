import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// นำเข้าคิวจากไฟล์ Excel/CSV ของตัวแทน (ขั้นตอนที่ 1: อ่านไฟล์ + ตรวจทานล่วงหน้า)
export async function POST(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!core.can(user.role, "agency.manage") && !core.isAgency(user)) return NextResponse.json({ error: "นำเข้าคิวจากไฟล์ — เฉพาะฝ่ายขาย ผู้ดูแลระบบ และบัญชีตัวแทน" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  let buf = null;
  try { buf = Buffer.from(String(body.data || ""), "base64"); } catch { buf = null; }
  if (!buf || !body.data) return NextResponse.json({ error: "ไม่พบข้อมูลไฟล์" }, { status: 400 });
  if (buf.length > 3e6) return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป (รับสูงสุด ~3 MB)" }, { status: 400 });
  let table;
  try { table = core.xlsxlite.readTable(buf, String(body.filename || "")); } catch (e) { return NextResponse.json({ error: "อ่านไฟล์ไม่สำเร็จ: " + e.message }, { status: 400 }); }
  let raws;
  try { raws = core.tableToRawRows(table); } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  if (!raws.length) return NextResponse.json({ error: "ไม่พบรายชื่อในไฟล์ (มีแต่หัวตารางหรือแถวว่าง)" }, { status: 400 });
  const rows = core.analyzeImportRows(raws).map((a) => ({
    row: a.row, ok: a.ok, error: a.error, raw: raws.find((r) => r.rowNo === a.row),
    date: a.date || "", time: a.time || "", service: a.serviceName || "", item: a.itemId || "",
    name: a.name || "", phone: a.phone || "", email: a.email || "", rights: a.ok ? a.rights : "", note: a.ok ? a.note : "",
  }));
  await core.audit(user, "agency_import_parse", `${body.filename || "?"} — ตรวจ ${rows.length} แถว`);
  return NextResponse.json({ rows, total: rows.length });
}
