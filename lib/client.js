// ตัวช่วยฝั่งเบราว์เซอร์ (ใช้ร่วมทุกหน้า) — พอร์ตมาจาก public/api.js ยุคก่อน
"use client";

export const TOKEN_KEY = "q_token";
export const authSave = (token) => localStorage.setItem(TOKEN_KEY, token);
export const authClear = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (res.status === 401) authClear(); // token หมดอายุ/ไม่ถูกต้อง — ทิ้งไปเลยให้หน้าที่ต้องล็อกอินเด้งเข้าสู่ระบบใหม่
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || "เกิดข้อผิดพลาด (HTTP " + res.status + ")");
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- ตัวช่วยทั่วไป ----------
export const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const fromISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const fmtFullTh = (iso) => new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(fromISO(iso));
export const fmtDayShort = (iso) => new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(fromISO(iso));
export const fmtDateShort = (iso) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(fromISO(iso));
export const fmtBaht = (n) => (n === 0 ? "ฟรี" : Number(n).toLocaleString("th-TH") + " บาท");
// เบอร์โทรที่ติดต่อกลับได้จริงเท่านั้น — มือถือไทย 06/08/09 ตามด้วยเลข 8 หลัก (รวม 10 หลัก),
// สายบ้าน 02–05/07 รวม 9 หลัก, หรือต่างประเทศ +รหัสประเทศ (หลักแรกไม่ใช่ 0) แล้วตามด้วยเลขอีก 6–14 หลัก
export const phoneOk = (p) => /^(0[689]\d{8}|0[23457]\d{7}|\+[1-9]\d{6,14})$/.test(String(p || "").replace(/[\s\-()]/g, ""));

// อีเมล (ไม่บังคับกรอก) — รูปแบบง่าย: ไม่มีช่องว่าง มี @ ตรงกลาง โดเมนมีจุด (ตรงกับฝั่ง server ใน lib/core.js)
export const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

// วันให้บริการของแต่ละบริการ (service.days) — เก็บเป็นเลขวันตาม getDay(): 0=อาทิตย์ … 6=เสาร์
// ไม่ได้ตั้ง (ไม่มีฟิลด์ days) = เปิดทุกวัน
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // เรียงแบบไทย: จ อ พ พฤ ศ ส อา
export const DAY_LABELS = { 1: "จ", 2: "อ", 3: "พ", 4: "พฤ", 5: "ศ", 6: "ส", 0: "อา" };
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const svcDays = (s) => {
  if (s && s.slotsByDay && typeof s.slotsByDay === "object" && Object.keys(s.slotsByDay).length)
    return [1, 2, 3, 4, 5, 6, 0].filter((d) => Array.isArray(s.slotsByDay[String(d)]) && s.slotsByDay[String(d)].length);
  return Array.isArray(s && s.days) && s.days.length ? s.days : ALL_DAYS;
};
// แสดงรายการวันแบบย่อ เช่น จ–ศ, จ–ส, อา–พฤ หรือ "ทุกวัน" — ใช้ทั้งตารางหลังบ้านและคำอธิบายหน้าจอง
export function fmtDays(days) {
  const set = Array.isArray(days) && days.length ? days : ALL_DAYS;
  const sorted = DAY_ORDER.filter((d) => set.includes(d));
  if (sorted.length === 7) return "ทุกวัน";
  const runs = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && DAY_ORDER[(DAY_ORDER.indexOf(last[last.length - 1]) + 1) % 7] === d) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length > 2 ? `${DAY_LABELS[r[0]]}–${DAY_LABELS[r[r.length - 1]]}` : r.map((x) => DAY_LABELS[x]).join(" "))).join(", ");
}

export const STATUS_META = {
  pending: { label: "รอยืนยัน", cls: "badge-pending" },
  confirmed: { label: "ยืนยันแล้ว", cls: "badge-confirmed" },
  cancelled: { label: "ยกเลิก", cls: "badge-cancelled" },
  noshow: { label: "ไม่มาตามนัด", cls: "badge-cancelled" },
};

// โหมดฝังในเว็บอื่น (เช่น WordPress): ?embed=1 — ซ่อนหัว/ท้ายเว็บ
import { useEffect, useState } from "react";
export function useEmbed() {
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("embed") === "1") {
      setEmbed(true);
      document.body.classList.add("embed");
    }
  }, []);
  return embed;
}
