import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const date = sp.get("date");
  const from = sp.get("from");
  const to = sp.get("to");
  const service = sp.get("service");
  const status = sp.get("status");
  const agency = sp.get("agency");
  // รองรับ 3 แบบ: วันเดียว (?date=), ช่วงวันที่ (?from=...&to=...), ทุกวัน (?all=1) + กรองบริการ/สถานะ/ตัวแทนเพิ่มได้
  let rows = sp.get("all") === "1"
    ? [...core.db.bookings]
    : (from || to)
      ? core.db.bookings.filter((b) => (!from || b.date >= from) && (!to || b.date <= to))
      : core.db.bookings.filter((b) => b.date === (date || core.todayISO()));
  if (service && service !== "all") rows = rows.filter((b) => b.serviceId === service);
  if (status && status !== "all") rows = rows.filter((b) => b.status === status);
  if (agency && agency !== "all") rows = rows.filter((b) => b.agencyCode === agency);
  rows = [...rows].sort((a, b2) => (a.date + a.time).localeCompare(b2.date + b2.time));
  const label = sp.get("all") === "1" ? "ทุกวัน" : (from || to) ? `${from || "เริ่ม"} ถึง ${to || "ปัจจุบัน"}` : (date || core.todayISO());
  const esc2 = (v) => {
    let s = String(v ?? "");
    // กัน CSV/formula injection ใน Excel: ขึ้นต้นด้วย = + - @ ให้เติม ' ข้างหน้า
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = "\uFEFF" + ["เวลา", "คิวที่", "รหัส", "ชื่อ", "เบอร์โทร", "อีเมล", "บริการ", "รายการ", "ช่องทาง", "ตัวแทน", "สิทธิ์", "สถานะ", "หมายเหตุ"].join(",") + "\n" +
    rows.map((b) => {
      const s = core.svc(b.serviceId) || { name: "บริการที่ถูกลบ" };
      const item = (s.items || []).find((i) => i.id === b.itemId);
      const st = { pending: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก", noshow: "ไม่มาตามนัด" }[b.status] || b.status;
      return [b.time, b.qno, b.code, b.name, b.phone, b.email || "", s.name, item ? item.name : "", b.source, b.agencyCode || "", b.rights, st, b.note].map(esc2).join(",");
    }).join("\n");
  await core.audit(user, "export_csv", label);
  const fname = sp.get("all") === "1" ? "queue-all.csv" : (from || to) ? `queue-${from || "start"}-to-${to || "now"}.csv` : `queue-${date || core.todayISO()}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
