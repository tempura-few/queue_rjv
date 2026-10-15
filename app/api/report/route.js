import { NextResponse } from "next/server";
import core from "@/lib/core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANNELS = ["online", "walkin", "agency", "callback"];
const DOW_LABELS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// หน้ารายงานหลังบ้าน — GET /api/report?days=30 (หรือ days=all สำหรับทุกวันที่มีข้อมูล)
// คืน KPI + ชุดข้อมูลพร้อมวาดกราฟ: แนวโน้มรายวัน, แยกช่องทาง/บริการ/ช่วงเวลา/วันสัปดาห์, ตัวแทน, รายการยอดนิยม
export async function GET(request) {
  await core.ensureInit();
  const user = core.userFromRequest(request);
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const isAll = sp.get("days") === "all";
  const days = isAll ? 0 : Math.min(365, Math.max(1, Number(sp.get("days")) || 30));
  const today = core.todayISO();
  const from = isAll ? null : core.datePlus(-(days - 1)); // datePlus(n) = วันนี้ + n วัน

  // โหมดช่วงวันที่: นับเฉพาะคิวที่มีวันนัดใน [from, วันนี้] — คำขอรอนัดหมาย (ไม่มีวันนัด) เข้าเฉพาะโหมด "ทั้งหมด"
  const rows = core.db.bookings.filter((b) => (!from || (b.date && b.date >= from && b.date <= today)));

  const svcById = new Map(core.db.services.map((s) => [s.id, s]));

  // ---- KPI ----
  const kpi = {
    total: rows.length,
    confirmed: 0, pending: 0, cancelled: 0, noshow: 0,
    todayTotal: 0, uniquePatients: new Set(), activeDays: new Set(),
  };
  for (const b of rows) {
    if (b.status === "confirmed") kpi.confirmed++;
    else if (b.status === "pending") kpi.pending++;
    else if (b.status === "cancelled") kpi.cancelled++;
    else if (b.status === "noshow") kpi.noshow++;
    if (b.date === today) kpi.todayTotal++;
    if (b.date) { kpi.activeDays.add(b.date); kpi.uniquePatients.add((b.name || "").trim().toLowerCase() + "|" + (b.phone || "")); }
  }
  const activeDayCount = kpi.activeDays.size || 1;
  kpi.avgPerDay = Math.round((rows.length / activeDayCount) * 10) / 10;

  // ---- อัตรานัดสำเร็จ: ในบรรดาคิวที่ "ถึงวันนัดแล้ว" มากี่ % (ยืนยัน=มา, noshow=ไม่มา — ยกเลิก/รอยืนยันไม่นับ) ----
  let shown = 0, missed = 0;
  for (const b of rows) {
    if (!b.date || b.date > today) continue; // วันนัดยังไม่ถึง = ยังตัดสินไม่ได้
    if (b.status === "confirmed") shown++;
    else if (b.status === "noshow") missed++;
  }

  // ---- แนวโน้มรายวัน (โหมด "ทั้งหมด" แสดงแค่ 90 วันล่าสุดเพื่อให้กราฟอ่านง่าย) ----
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const trendStart = from && from > core.datePlus(-89) ? from : core.datePlus(-89);
  const daily = [];
  const dailyMap = new Map();
  for (let d = new Date(trendStart + "T00:00:00"); ; d.setDate(d.getDate() + 1)) {
    const dateISO = isoDay(d);
    dailyMap.set(dateISO, { date: dateISO, total: 0, online: 0, walkin: 0, agency: 0 });
    if (dateISO === today) break;
  }
  for (const b of rows) {
    if (!b.date || b.date < trendStart) continue;
    const d = dailyMap.get(b.date);
    if (!d) continue;
    if (b.status !== "cancelled") d.total++;
    if (b.source === "online") d.online++;
    else if (b.source === "walkin") d.walkin++;
    else if (b.source === "agency") d.agency++;
  }
  dailyMap.forEach((d) => daily.push(d));
  daily.sort((a, b) => (a.date < b.date ? -1 : 1));

  // ---- แยกตามช่องทาง ----
  const byChannel = CHANNELS.map((c) => {
    const list = rows.filter((b) => b.source === c);
    return { ch: c, total: list.length, confirmed: list.filter((b) => b.status === "confirmed").length };
  });

  // ---- แยกตามบริการ ----
  const svcAgg = new Map();
  for (const b of rows) {
    const s = svcById.get(b.serviceId);
    if (!s) continue;
    if (!svcAgg.has(s.id)) svcAgg.set(s.id, { id: s.id, icon: s.icon, name: s.name, total: 0, confirmed: 0 });
    const a = svcAgg.get(s.id);
    a.total++;
    if (b.status === "confirmed") a.confirmed++;
  }
  const byService = [...svcAgg.values()].sort((a, b) => b.total - a.total);

  // ---- ช่วงเวลายอดนิยม + วันสัปดาห์ (กราฟวันสัปดาห์แสดงครบ จ–อา แม้บางวันยังไม่มีคิว) ----
  const slotAgg = new Map(), dowAgg = new Map(), itemAgg = new Map();
  for (let i = 0; i < 7; i++) dowAgg.set(i, 0);
  for (const b of rows) {
    if (!b.date || b.status === "cancelled") continue;
    if (b.time) slotAgg.set(b.time, (slotAgg.get(b.time) || 0) + 1);
    dowAgg.set(new Date(b.date + "T00:00:00").getDay(), (dowAgg.get(new Date(b.date + "T00:00:00").getDay()) || 0) + 1);
    if (b.itemId) {
      const s = svcById.get(b.serviceId);
      const it = s && Array.isArray(s.items) ? s.items.find((i) => i.id === b.itemId) : null;
      if (it) {
        const k = s.id + "|" + it.id;
        if (!itemAgg.has(k)) itemAgg.set(k, { name: it.name, service: s.name, icon: s.icon, total: 0 });
        itemAgg.get(k).total++;
      }
    }
  }
  const bySlot = [...slotAgg.entries()].map(([time, total]) => ({ time, total })).sort((a, b) => (a.time < b.time ? -1 : 1));
  const byDow = [...dowAgg.entries()].map(([dow, total]) => ({ dow, label: DOW_LABELS[dow], total })).sort((a, b) => a.dow - b.dow);

  // ---- ตัวแทน: คิวที่ส่งมาแยกสถานะครบ + อัตรามาจริง (นับเฉพาะคิวที่ถึงวันนัดแล้ว เหมือน KPI หลัก) ----
  const agencyAgg = new Map();
  for (const b of rows) {
    if (!b.agencyCode) continue;
    if (!agencyAgg.has(b.agencyCode)) agencyAgg.set(b.agencyCode, { code: b.agencyCode, total: 0, confirmed: 0, noshow: 0, cancelled: 0, pending: 0, shown: 0, missed: 0 });
    const a = agencyAgg.get(b.agencyCode);
    a.total++;
    if (b.status === "confirmed") a.confirmed++;
    else if (b.status === "noshow") a.noshow++;
    else if (b.status === "cancelled") a.cancelled++;
    else if (b.status === "pending") a.pending++;
    if (b.date && b.date <= today) {
      if (b.status === "confirmed") a.shown++;
      else if (b.status === "noshow") a.missed++;
    }
  }
  const agencies = [...agencyAgg.values()]
    .map((a) => ({ ...a, successRate: a.shown + a.missed ? Math.round((a.shown / (a.shown + a.missed)) * 100) : null }))
    .sort((a, b) => b.total - a.total);
  const topItems = [...itemAgg.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  return NextResponse.json({
    mode: isAll ? "all" : "days",
    from: from || null, to: today,
    kpi: {
      total: kpi.total, confirmed: kpi.confirmed, pending: kpi.pending, cancelled: kpi.cancelled, noshow: kpi.noshow,
      todayTotal: kpi.todayTotal, unique: kpi.uniquePatients.size,
      activeDays: kpi.activeDays.size, avgPerDay: kpi.avgPerDay,
      successRate: shown + missed ? Math.round((shown / (shown + missed)) * 100) : null,
      successShown: shown, successMissed: missed,
    },
    daily, byChannel, byService, bySlot, byDow, agencies, topItems,
  });
}
