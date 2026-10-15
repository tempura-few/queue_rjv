// ============================================================
// lib/i18n.js — ระบบสามภาษา (ไทย/English/မြန်မာ) หน้าเว็บผู้ป่วย
// เก็บภาษาที่เลือกใน localStorage + broadcast ผ่าน event ให้ทุกหน้าอัปเดตพร้อมกัน
// (หลังบ้านเจ้าหน้าที่คงภาษาไทยเพียงภาษาเดียว)
// ============================================================
"use client";
import { useEffect, useState } from "react";

export const LANG_KEY = "q_lang";
export const getLang = () => {
  const v = typeof window !== "undefined" && localStorage.getItem(LANG_KEY);
  return v === "en" || v === "my" ? v : "th";
};

// hook: [lang, setLang] — ทุกคอมโพเนนต์ที่ใช้จะเปลี่ยนพร้อมกันเมื่อสลับภาษา
export function useLang() {
  const [lang, setLangState] = useState("th");
  useEffect(() => {
    const apply = () => {
      const l = getLang();
      setLangState(l);
      document.documentElement.lang = l;
    };
    apply();
    window.addEventListener("q-lang-change", apply);
    return () => window.removeEventListener("q-lang-change", apply);
  }, []);
  const setLang = (l) => {
    localStorage.setItem(LANG_KEY, l);
    window.dispatchEvent(new Event("q-lang-change"));
  };
  return [lang, setLang];
}

// วันที่แบบเต็มตามภาษา — th: "วันจันทร์ที่ 5 ตุลาคม พ.ศ. 2569" / en: "Monday, 5 October 2026" / my: "တနင်္လာနေ့၊ အောက်တိုဘာ ၅၊ ၂၀၂၆"
// เบราว์เซอร์/WebView บางรุ่นไม่มีข้อมูล locale พม่าใน ICU (Intl เงียบๆ ไป en-US) — ตรวจตอนโหลดแล้วใช้ตารางของเราเองแทน
const MY_MONTHS = ["ဇန်နဝါရီ", "ဖေဖော်ဝါရီ", "မတ်", "ဧပြီ", "မေ", "ဇွန်", "ဇူလိုင်", "သြဂုတ်", "စက်တင်ဘာ", "အောက်တိုဘာ", "နိုဝင်ဘာ", "ဒီဇင်ဘာ"];
const MY_DAYS = ["တနင်္ဂနွေ", "တနင်္လာ", "အင်္ဂါ", "ဗုဒ္ဓဟူး", "ကြာသပတေး", "သောကြာ", "စနေ"];
const MY_DIGITS = "၀၁၂၃၄၅၆၇၈၉";
const INTL_HAS_MY = (() => {
  try { return /[\u1000-\u109F]/.test(new Intl.DateTimeFormat("my-MM", { dateStyle: "full" }).format(new Date(2026, 9, 12))); }
  catch { return false; }
})();
export const fmtFull = (iso, lang) => {
  const d = new Date(iso + "T00:00:00");
  if (lang === "en") return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  if (lang === "my") {
    if (INTL_HAS_MY) return new Intl.DateTimeFormat("my-MM", { dateStyle: "full" }).format(d);
    const num = (n) => String(n).replace(/\d/g, (x) => MY_DIGITS[x]);
    return `${MY_DAYS[d.getDay()]}နေ့၊ ${MY_MONTHS[d.getMonth()]} ${num(d.getDate())}၊ ${num(d.getFullYear())}`;
  }
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(d);
};

// ชื่อบริการ/รายการจากฐานข้อมูลมีเฉพาะ th/en — โหมด en/my แสดงชื่ออังกฤษถ้ากรอกไว้ ไม่มีก็แสดงไทย
export const pickSvc = (lang, th, en) => ((lang === "en" || lang === "my") && en ? en : th);

// ---------- แปลข้อความ error จาก server (ไทย → en/my) สำหรับโหมดที่ไม่ใช่ไทย ----------
// server ส่ง error เป็นไทยชุดเดียว — ฝั่งหน้าเว็บแปลให้ตอนแสดง โดยจับคู่ด้วยรูปแบบ (รองรับค่า dynamic เช่นจำนวนวัน/ชื่อวัน)
const TH_DAYS_EN = { "พฤหัสบดี": "Thursday", "จันทร์": "Monday", "อังคาร": "Tuesday", "พุธ": "Wednesday", "ศุกร์": "Friday", "เสาร์": "Saturday", "อาทิตย์": "Sunday" };
const ERR_EN = [
  [/^จองบ่อยเกินไป/, () => "Too many bookings — please wait a moment (limit 10 per 15 minutes)"],
  [/^กรุณายินยอมการเก็บข้อมูล/, () => "Please tick the PDPA consent box before booking"],
  [/^บริการนี้ไม่เปิดให้จอง/, () => "This service is not available for booking"],
  [/^รายการบริการไม่ถูกต้อง/, () => "Invalid service item"],
  [/^วันที่ไม่ถูกต้อง \(จองล่วงหน้าได้ 1–(\d+) วัน\)$/, (m) => `Invalid date — booking is open 1–${m[1]} days ahead`],
  [/^บริการนี้ให้จองได้เฉพาะวัน (.+) เท่านั้น$/, (m) => `This service accepts bookings on ${m[1].replace(/พฤหัสบดี|จันทร์|อังคาร|พุธ|ศุกร์|เสาร์|อาทิตย์/g, (w) => TH_DAYS_EN[w])} only`],
  [/^ช่วงเวลาไม่ถูกต้อง/, () => "Invalid time slot"],
  [/^ช่วงเวลานี้ผ่านไปแล้วสำหรับวันนี้/, () => "This time slot has already passed for today"],
  [/^กรุณากรอกชื่อ/, () => "Please enter your name"],
  [/^เบอร์โทรไม่ถูกต้อง/, () => "Invalid phone number — Thai mobile 06/08/09 + 8 digits, landline 9 digits starting 0, or +country code (e.g. +95…)"],
  [/^กรุณากรอกเบอร์โทรหรืออีเมลอย่างน้อย/, () => "Please provide at least one contact — phone number or email"],
  [/^รูปแบบอีเมลไม่ถูกต้อง/, () => "Invalid email format (e.g. name@email.com) — leave blank if you don't have one"],
  [/^ช่วงเวลานี้เต็มแล้ว/, () => "This time slot is full — please choose another time"],
  [/^ไม่พบรหัสการจองนี้/, () => "Booking code not found — please check the code and try again"],
  [/^bad request$/, () => "Invalid request"],
  [/^เกิดข้อผิดพลาด/, (m) => "Something went wrong (" + m.input.match(/\(([^)]+)\)/)?.[1] + ")"],
];

const TH_DAYS_MY = { "พฤหัสบดี": "ကြာသပတေးနေ့", "จันทร์": "တနင်္လာနေ့", "อังคาร": "အင်္ဂါနေ့", "พุธ": "ဗုဒ္ဓဟူးနေ့", "ศุกร์": "သောကြာနေ့", "เสาร์": "စနေနေ့", "อาทิตย์": "တနင်္ဂနွေနေ့" };
const ERR_MY = [
  [/^จองบ่อยเกินไป/, () => "အလွန်အကြူး စာရင်းသွင်းနေပါသည် — ခဏစောင့်ပါ (၁၅ မိနစ်လျှင် အကြိမ် ၁၀ သာ ခွင့်ပြုသည်)"],
  [/^กรุณายินยอมการเก็บข้อมูล/, () => "စာရင်းသွင်းမည်မှ ကိုယ်ရေးအချက်အလက် သဘောတူညီမှုကို ရွေးချယ်ပေးပါ"],
  [/^บริการนี้ไม่เปิดให้จอง/, () => "ဤဝန်ဆောင်မှုကို စာရင်းသွင်း၍ မရနိုင်ပါ"],
  [/^รายการบริการไม่ถูกต้อง/, () => "ဝန်ဆောင်မှု အကြောင်းအရာ မမှန်ပါ"],
  [/^วันที่ไม่ถูกต้อง \(จองล่วงหน้าได้ 1–(\d+) วัน\)$/, (m) => `ရက်စွဲ မမှန်ပါ — ကြိုတင်စာရင်းသွင်းနိုင်သည်မှာ ၁–${m[1]} ရက်အတွင်းသာ ဖြစ်သည်`],
  [/^บริการนี้ให้จองได้เฉพาะวัน (.+) เท่านั้น$/, (m) => `ဤဝန်ဆောင်မှုကို ${m[1].replace(/พฤหัสบดี|จันทร์|อังคาร|พุธ|ศุกร์|เสาร์|อาทิตย์/g, (w) => TH_DAYS_MY[w])} တွင်သာ စာရင်းသွင်းနိုင်သည်`],
  [/^ช่วงเวลาไม่ถูกต้อง/, () => "အချိန်တပြား မမှန်ပါ"],
  [/^ช่วงเวลานี้ผ่านไปแล้วสำหรับวันนี้/, () => "ယနေ့အတွက် ဤအချိန်တပြား ကျော်လွန်သွားပါပြီ"],
  [/^กรุณากรอกชื่อ/, () => "ကျေးဇူးပြု၍ အမည်ကို ဖြည့်ပါ"],
  [/^เบอร์โทรไม่ถูกต้อง/, () => "ဖုန်းနံပါတ် မမှန်ပါ — ထိုင်းမိုဘိုင်း 06/08/09 + ဂဏန်း ၈ လုံး၊ အိမ်သုံးဖုန်း ဂဏန်း ၉ လုံး၊ သို့မဟုတ် +နိုင်ငံကုဒ် (ဥပမာ +95…)"],
  [/^กรุณากรอกเบอร์โทรหรืออีเมลอย่างน้อย/, () => "ဆက်သွယ်ရန် ဖုန်းနံပါတ် သို့မဟုတ် အီးမေးလ် အနည်းဆုံး တစ်ခု ဖြည့်ပေးပါ"],
  [/^รูปแบบอีเมลไม่ถูกต้อง/, () => "အီးမေးလ်ပုံစံ မမှန်ပါ (ဥပမာ name@email.com) — မရှိပါက ချန်လှပ်ထားနိုင်သည်"],
  [/^ช่วงเวลานี้เต็มแล้ว/, () => "ဤအချိန်တပြား ပြည့်နေပါပြီ — အခြားအချိန်ကို ရွေးပါ"],
  [/^ไม่พบรหัสการจองนี้/, () => "ဤစာရင်းသွင်းမှုကုဒ်ကို မတွေ့ရှိပါ — ကုဒ်ကို ပြန်စစ်ကြည့်ပါ"],
  [/^bad request$/, () => "တောင်းဆိုမှု မမှန်ပါ"],
  [/^เกิดข้อผิดพลาด/, (m) => "အမှားတစ်ခု ဖြစ်ပွားခဲ့သည် (" + m.input.match(/\(([^)]+)\)/)?.[1] + ")"],
];

export function tErr(msg, lang) {
  if (lang === "th" || !msg) return msg;
  const s = String(msg);
  for (const [re, fn] of lang === "my" ? ERR_MY : ERR_EN) {
    const m = s.match(re);
    if (m) return fn(m);
  }
  return s; // error ที่ไม่มีในชุดแปล — แสดงต้นฉบับไทยไว้ก่อน
}
