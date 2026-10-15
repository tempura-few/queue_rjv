"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader.js";
import SiteFooter from "@/components/SiteFooter.js";
import { api, STATUS_META, useEmbed } from "@/lib/client.js";
import { CONFIG } from "@/lib/config.js";
import { useLang, fmtFull, tErr, pickSvc } from "@/lib/i18n.js";

const T = {
  th: {
    title: "จองคิวสำเร็จ — ",
    notFound: "ไม่พบข้อมูลการจอง",
    loading: "กำลังโหลดข้อมูลการจอง…",
    ok: "จองคิวสำเร็จ",
    saveHint: "กรุณาบันทึกรหัสด้านล่างนี้ไว้ และมาถึงก่อนเวลานัด 15 นาที",
    qno: (n) => "คิวที่ " + n,
    req: (n) => "คำขอที่ " + n,
    waitCall: "📞 รอโรงพยาบาลติดต่อกลับเพื่อนัดวัน–เวลา",
    at: (d, t) => d + " · เวลา " + t + " น.",
    ref: "รหัสอ้างอิง: ",
    viaAgency: "จองผ่านตัวแทน: ",
    status: "สถานะ: ",
    stPending: "รอติดต่อกลับ", stConfirmed: "ติดต่อ/นัดแล้ว", stCancelled: "ยกเลิก",
    tipDated: (p) => <>หากมาไม่ได้ กรุณาแจ้งเคาน์เตอร์หรือโทร {p} เพื่อยกเลิก/เลื่อนนัด</>,
    tipWait: (p) => <>เจ้าหน้าที่จะติดต่อกลับตามเบอร์ที่กรอกไว้ — หากมีข้อสงสัยโทร {p}</>,
    home: "กลับหน้าแรก",
    keepBanner: "📸 กรุณาแคปหน้าจอนี้ (หรือกดคัดลอกด้านล่าง) เก็บไว้แสดงเจ้าหน้าที่ในวันรับบริการ — หน้านี้คือหลักฐานการจองของท่าน",
    copyCode: "คัดลอกรหัสการจอง", copyAll: "คัดลอกสรุปทั้งหมด", copied: "คัดลอกแล้ว ✓",
    sumSvc: "บริการ", sumDate: "วัน–เวลา", sumStatus: "สถานะ", sumQ: "คิวที่",
    lookupHint: "จะกลับมาดูหน้านี้อีกครั้งได้ที่หน้าแรก → ช่อง \"ตรวจสอบการจอง\" โดยใช้รหัสนี้",
  },
  en: {
    title: "Booking confirmed — ",
    notFound: "Booking not found",
    loading: "Loading your booking…",
    ok: "Booking confirmed",
    saveHint: "Please save the code below and arrive 15 minutes before your appointment",
    qno: (n) => "Queue no. " + n,
    req: (n) => "Request no. " + n,
    waitCall: "📞 The hospital will call you back to arrange date & time",
    at: (d, t) => d + " · " + t,
    ref: "Reference code: ",
    viaAgency: "Booked via agency: ",
    status: "Status: ",
    stPending: "Awaiting call back", stConfirmed: "Appointment made", stCancelled: "Cancelled",
    tipDated: (p) => <>If you cannot come, please inform the counter or call {p} to cancel or reschedule</>,
    tipWait: (p) => <>Our staff will call you back on the number you provided — for any questions call {p}</>,
    home: "Back to home",
    keepBanner: "📸 Please screenshot this page (or use the copy buttons below) and show it to staff on your visit — this page is your booking proof",
    copyCode: "Copy booking code", copyAll: "Copy full details", copied: "Copied ✓",
    sumSvc: "Service", sumDate: "Date & time", sumStatus: "Status", sumQ: "Queue no.",
    lookupHint: "To view this page again later, use this code in the \"Check my booking\" box on the home page",
  },
  my: {
    title: "စာရင်းသွင်းမှု အတည်ဖြစ်ပြီး — ",
    notFound: "စာရင်းသွင်းမှုကို မတွေ့ရှိပါ",
    loading: "သင့်စာရင်းသွင်းမှုကို ရယူနေသည်…",
    ok: "စာရင်းသွင်းမှု အတည်ဖြစ်ပါပြီ",
    saveHint: "အောက်ပါကုဒ်ကို သိမ်းဆည်းထားပြီး သတ်မှတ်အချိန်မတိုင်မီ ၁၅ မိနစ် အလို ရောက်ရှိပေးပါ",
    qno: (n) => "အမှတ်စဉ် " + n,
    req: (n) => "တောင်းဆိုမှု အမှတ် " + n,
    waitCall: "📞 ဆေးရုံမှ ရက်စွဲ–အချိန် သတ်မှတ်ပေးရန် ပြန်ခေါ်ပါမည်",
    at: (d, t) => d + " · အချိန် " + t + " နာရီ",
    ref: "ရည်ညွှန်းကုဒ်: ",
    viaAgency: "ကိုယ်စားလှယ်ဖြင့် စာရင်းသွင်းခြင်း: ",
    status: "အခြေအနေ: ",
    stPending: "ပြန်ခေါ်ရန် စောင့်ဆိုင်းနေ", stConfirmed: "ရက်ချိန်းပြုလုပ်ပြီး", stCancelled: "ပယ်ဖျက်ပြီး",
    tipDated: (p) => <>မလာနိုင်ပါက ကောင်တာကို အသိပေးပါ သို့မဟုတ် ပယ်ဖျက်/ရွှေ့ဆိုင်းရန် {p} သို့ ဖုန်းဆက်ပါ</>,
    tipWait: (p) => <>ဝန်ထမ်းများက သင်ဖြည့်ထားသော နံပါတ်သို့ ပြန်ခေါ်ပါမည် — မေးခွန်းရှိပါက {p} သို့ ဖုန်းဆက်ပါ</>,
    home: "ပင်မစာမျက်နှာသို့",
    keepBanner: "📸 ဤစာမျက်နှာကို စကရင်ရှော့ ရိုက်ထားပါ (သို့မဟုတ် အောက်ရှိ ကူးယူခလုတ်ကို နှိပ်ပါ) — ဝန်ဆောင်မှုခံယူမည့်နေ့တွင် ဝန်ထမ်းအား ပြပါ။ ဤစာမျက်နှာသည် သင့်စာရင်းသွင်းမှု၏ အထောက်အထား ဖြစ်သည်",
    copyCode: "စာရင်းသွင်းမှုကုဒ် ကူးယူပါ", copyAll: "အားလုံးကို ကူးယူပါ", copied: "ကူးယူပြီးပါပြီ ✓",
    sumSvc: "ဝန်ဆောင်မှု", sumDate: "ရက်စွဲ–အချိန်", sumStatus: "အခြေအနေ", sumQ: "အမှတ်စဉ်",
    lookupHint: "ဤစာမျက်နှာကို နောက်တစ်ကြိမ် ပြန်ကြည့်လိုပါက ပင်မစာမျက်နှာရှိ \"ကျွန်ုပ်၏ စာရင်းသွင်းမှုကို စစ်ကြည့်ရန်\" ကွက်လပ်တွင် ဤကုဒ်ဖြင့် ရှာပါ",
  },
};

// ป้ายสถานะของการจองที่มีวันที่ — ไทยดึงจาก STATUS_META (หลังบ้าน), en/my แปลไว้ที่นี่
const ST_EN = { pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled", noshow: "No show" };
const ST_MY = { pending: "စောင့်ဆိုင်းနေ", confirmed: "အတည်ပြုပြီး", cancelled: "ပယ်ဖျက်ပြီး", noshow: "မလာခဲ့ပါ" };
const stDated = (status, lang) =>
  STATUS_META[status] ? (lang === "en" ? ST_EN[status] || status : lang === "my" ? ST_MY[status] || status : STATUS_META[status].label) : status;

export default function SuccessPage() {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(""); // แจ้งผลการกดคัดลอก: "code" | "all" | ""
  const embed = useEmbed();
  const [lang] = useLang();
  const L = T[lang];
  const C = lang === "th" ? CONFIG : CONFIG[lang];

  async function copyText(text, which) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // เบราว์เซอร์เก่า/ไม่มี clipboard API — พุ่งผ่าน textarea ชั่วคราว
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(which);
    setTimeout(() => setCopied(""), 2500);
  }
  function summaryText(b) {
    const statusText = b.date ? stDated(b.status, lang)
      : (b.status === "pending" ? L.stPending : b.status === "confirmed" ? L.stConfirmed : b.status);
    const lines = [
      C.hospitalName,
      `${L.ref}${b.code}`,
      `${L.sumSvc}: ${b.icon} ${pickSvc(lang, b.service, b.serviceEn)}`,
    ];
    if (b.date) lines.push(`${L.sumDate}: ${fmtFull(b.date, lang)} ${b.time}`, `${L.sumQ} ${b.qno}`);
    else lines.push(L.waitCall);
    lines.push(`${L.sumStatus}: ${statusText}`);
    return lines.join("\n");
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code") || "";
    api("/api/booking/" + encodeURIComponent(code))
      .then(({ booking: b }) => { setBooking(b); document.title = L.title + b.code; })
      .catch((e) => setError(e.message));  }, []);

  return (
    <>
      {!embed && <SiteHeader activePage="booking" />}
      <main className="container">
        <div className="wizard-card success-card">
          {error ? (
            <>
              <div className="ok-emoji">😕</div>
              <h2>{L.notFound}</h2>
              <p className="hint">{tErr(error, lang)}</p>
              <Link className="btn btn-ghost" href="/">{L.home}</Link>
            </>
          ) : !booking ? (
            <p className="hint">{L.loading}</p>
          ) : (
            <>
              <div className="ok-emoji">✅</div>
              <h2 style={{ margin: "0 0 2px", color: "var(--ink)" }}>{L.ok}</h2>
              <p className="hint">{L.saveHint}</p>
              <div className="keep-banner">{L.keepBanner}</div>
              <div className="code-box">
                {booking.date ? (
                  <>
                    <div className="qno-big">{L.qno(booking.qno)}</div>
                    <div className="dt-line">{L.at(fmtFull(booking.date, lang), booking.time)}</div>
                  </>
                ) : (
                  <>
                    <div className="qno-big">{L.req(booking.qno)}</div>
                    <div className="dt-line">{L.waitCall}</div>
                  </>
                )}
                <div className="svc-line">{booking.icon} {pickSvc(lang, booking.service, booking.serviceEn)}</div>
                <div className="ref">{L.ref}<b>{booking.code}</b></div>
                {booking.agencyCode ? <div className="ref">{L.viaAgency}<b>{booking.agencyCode}</b></div> : null}
                <div className="ref">{L.status}<b>{booking.date
                  ? stDated(booking.status, lang)
                  : (booking.status === "pending" ? L.stPending : booking.status === "confirmed" ? L.stConfirmed : booking.status === "cancelled" ? L.stCancelled : booking.status)}</b></div>
              </div>
              <p className="hint" style={{ marginTop: 14 }}>{booking.date ? L.tipDated(CONFIG.phone) : L.tipWait(CONFIG.phone)}</p>
              <div className="copy-actions">
                <button className="btn btn-primary" type="button" onClick={() => copyText(booking.code, "code")}>
                  {copied === "code" ? L.copied : "📋 " + L.copyCode}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => copyText(summaryText(booking), "all")}>
                  {copied === "all" ? L.copied : "📋 " + L.copyAll}
                </button>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>🔎 {L.lookupHint}</p>
              <Link className="btn btn-ghost" href="/" style={{ marginTop: 6 }}>{L.home}</Link>
            </>
          )}
        </div>
      </main>
      {!embed && <SiteFooter />}
    </>
  );
}
