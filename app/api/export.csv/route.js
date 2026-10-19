import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (core.isAgency(user)) return NextResponse.json({ error: "ส่งออกไฟล์ — เฉพาะเจ้าหน้าที่โรงพยาบาล" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const date = sp.get("date");
  const from = sp.get("from");
  const to = sp.get("to");
  const service = sp.get("service");
  const status = sp.get("status");
  const agency = sp.get("agency");
  const channel = sp.get("channel");
  const source = sp.get("source");
  // รองรับ 3 แบบ: วันเดียว (?date=), ช่วงวันที่ (?from=...&to=...), ทุกวัน (?all=1) + กรองบริการ/สถานะ/ตัวแทนเพิ่มได้
  let rows = sp.get("all") === "1"
    ? [...core.db.bookings]
    : (from || to)
      ? core.db.bookings.filter((b) => (!from || b.date >= from) && (!to || b.date <= to))
      : core.db.bookings.filter((b) => b.date === (date || core.todayISO()));
  if (service && service !== "all") rows = rows.filter((b) => b.serviceId === service);
  if (status && status !== "all") rows = rows.filter((b) => b.status === status);
  if (agency && agency !== "all") rows = rows.filter((b) => b.agencyCode === agency);
  if (channel && channel !== "all") rows = rows.filter((b) => (channel === "none" ? !b.channel : b.channel === channel));
  if (source && source !== "all") rows = rows.filter((b) => b.source === source);
  rows = [...rows].sort((a, b2) => (a.date + a.time).localeCompare(b2.date + b2.time));
  const label = sp.get("all") === "1" ? "ทุกวัน" : (from || to) ? `${from || "เริ่ม"} ถึง ${to || "ปัจจุบัน"}` : (date || core.todayISO());
  const esc2 = (v) => {
    let s = String(v ?? "");
    // กัน CSV/formula injection ใน Excel: ขึ้นต้นด้วย = + - @ ให้เติม ' ข้างหน้า
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = "\uFEFF" + ["เวลา", "คิวที่", "รหัส", "ชื่อ", "เบอร์โทร", "อีเมล", "บริการ", "รายการ", "แหล่งจอง", "ช่องทาง", "ตัวแทน", "สิทธิ์", "สถานะ", "หมายเหตุ", "จองเมื่อ"].join(",") + "\n" +
    rows.map((b) => {
      const s = core.svc(b.serviceId) || { name: "บริการที่ถูกลบ" };
      const item = (s.items || []).find((i) => i.id === b.itemId);
      const st = { pending: "รอยืนยัน", confirmed: "ยืนยันแล้ว", cancelled: "ยกเลิก", noshow: "ไม่มาตามนัด" }[b.status] || b.status;
      // วันที่ทำการจอง (สร้างรายการ) เวลาไทย — คนละอย่างกับวันที่นัด
      const made = b.createdAt ? new Date(b.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
      return [b.time, b.qno, b.code, b.name, b.phone, b.email || "", s.name, item ? item.name : "", { online: "Website", walkin: "Online", agency: "ตัวแทน", callback: "รอนัดหมาย" }[b.source] || b.source, b.channel || "", b.agencyCode || "", b.rights, st, b.note, made].map(esc2).join(",");
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
