"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader.js";
import SiteFooter from "@/components/SiteFooter.js";
import { api } from "@/lib/client.js";
import { CONFIG } from "@/lib/config.js";
import { useLang, pickSvc } from "@/lib/i18n.js";

const T = {
  th: {
    title: "จองคิวออนไลน์ — " + CONFIG.hospitalName,
    eyebrow: "🩺 ระบบจองคิวล่วงหน้า",
    h1a: "จองคิวก่อนถึงโรงพยาบาล",
    h1b: "ไม่ต้องยืนรอ เลือกเวลาเองได้",
    cta: "เลือกบริการที่จองได้",
    staff: "หน้าเจ้าหน้าที่",
    svcTitle: "บริการที่จองล่วงหน้าได้",
    svcSub: "คลิกเพื่อเริ่มจองคิว — เลือกวัน เวลา และกรอกข้อมูลจบในหน้าเดียว",
    loading: "กำลังโหลดบริการ…",
    loadErr: "โหลดบริการไม่สำเร็จ ลองรีเฟรชอีกครั้ง",
    empty: "ขณะนี้ยังไม่เปิดให้จองออนไลน์",
    book: "จองคิว →",
    stepsTitle: "ใช้งานง่ายใน 3 ขั้นตอน",
    stepsSub: "ออกแบบให้คนไข้จองเองจบภายใน 1 นาที จากมือถือ",
    steps: [
      ["เลือกบริการและช่วงเวลา", "เห็นที่นั่งว่างแบบเรียลไทม์ เลือกเวลาที่สะดวกล่วงหน้าได้ถึง 14 วัน"],
      ["รับรหัสการจอง + เลขคิว", "ระบบออกรหัสการจองและเลขคิวของวันนั้นทันที บันทึกหรือแคปหน้าจอไว้"],
      ["มาถึงก็เข้าตรวจ", "แสดงรหัสการจองที่เคาน์เตอร์ ลดเวลารอลงทะเบียนและคิวรอ"],
    ],
    lookupLabel: "🔎 ตรวจสอบการจอง",
    lookupPh: "รหัสการจอง เช่น RV-261015-257",
    lookupBtn: "ดูรายละเอียด",
  },
  en: {
    title: "Online Booking — " + CONFIG.en.hospitalName,
    eyebrow: "🩺 Online Appointment System",
    h1a: "Book your visit before you arrive",
    h1b: "Skip the queue — pick your own time",
    cta: "Browse bookable services",
    staff: "Staff Login",
    svcTitle: "Services available for online booking",
    svcSub: "Click to start booking — pick a date, time and fill in your details in one page",
    loading: "Loading services…",
    loadErr: "Could not load services. Please refresh and try again.",
    empty: "Online booking is not available at the moment.",
    book: "Book now →",
    stepsTitle: "Easy as 1–2–3",
    stepsSub: "Designed so patients can self-book in under a minute from a phone",
    steps: [
      ["Choose a service and time", "See real-time availability and pick a convenient time up to 14 days ahead"],
      ["Get your booking code + queue number", "The system issues a booking code and your queue number instantly — save or screenshot it"],
      ["Arrive and get checked in", "Show your booking code at the counter to skip most of the registration wait"],
    ],
    lookupLabel: "🔎 Check my booking",
    lookupPh: "Booking code e.g. RV-261015-257",
    lookupBtn: "View",
  },
  my: {
    title: "အွန်လိုင်း ကြိုတင်စာရင်းသွင်းခြင်း — " + CONFIG.my.hospitalName,
    eyebrow: "🩺 အွန်လိုင်း ကြိုတင်စာရင်းသွင်းသည့် စနစ်",
    h1a: "ဆေးရုံမရောက်မီ ကြိုတင်စာရင်းသွင်းပါ",
    h1b: "စောင့်စရာမလို — သင့်အချိန်ကိုယ်တိုင် ရွေးနိုင်သည်",
    cta: "စာရင်းသွင်းနိုင်သော ဝန်ဆောင်မှုများ ကြည့်ရန်",
    staff: CONFIG.my.staffPage,
    svcTitle: "အွန်လိုင်းဖြင့် ကြိုတင်စာရင်းသွင်းနိုင်သော ဝန်ဆောင်မှုများ",
    svcSub: "နှိပ်၍ စတင်စာရင်းသွင်းပါ — ရက်စွဲ၊ အချိန်နှင့် ကိုယ်ရေးအချက်အလက်များကို စာမျက်နှာတစ်ခုတည်းဖြင့် ဖြည့်နိုင်သည်",
    loading: "ဝန်ဆောင်မှုများ ရယူနေသည်…",
    loadErr: "ဝန်ဆောင်မှုများ ရယူမရနိုင်ပါ — ပြန်လည်ဖွင့်၍ ထပ်စမ်းကြည့်ပါ",
    empty: "လက်ရှိတွင် အွန်လိုင်းဖြင့် စာရင်းသွင်းခြင်း မဖွင့်ရသေးပါ",
    book: "စာရင်းသွင်းရန် →",
    stepsTitle: "အဆင့် ၃ ဆင့်ဖြင့် အသုံးပြုရလွယ်ကူသည်",
    stepsSub: "လူနာများ မိနစ် ၁ အတွင်း ဖုန်းဖြင့် ကိုယ်တိုင် စာရင်းသွင်းနိုင်ရန် ဒီဇိုင်းထုတ်ထားသည်",
    steps: [
      ["ဝန်ဆောင်မှုနှင့် အချိန် ရွေးပါ", "ခွင့်ပြုအချိန်များကို တိုက်ရိုက်မြင်နိုင်ပြီး ၁၄ ရက်အတွင်း သင်ကြိုက်နှစ်သက်သော အချိန်ကို ရွေးနိုင်သည်"],
      ["စာရင်းသွင်းမှုကုဒ် + အမှတ်စဉ် ရပါမည်", "စနစ်က စာရင်းသွင်းမှုကုဒ်နှင့် ထိုရက်၏ အမှတ်စဉ်ကို ချက်ချင်း ထုတ်ပေးသည် — သိမ်းဆည်းပါ သို့မဟုတ် စကရင်ရှော့ ရိုက်ထားပါ"],
      ["ရောက်ရှိလျှင် ချက်ချင်း စစ်ဆေးနိုင်သည်", "ကောင်တာတွင် စာရင်းသွင်းမှုကုဒ် ပြပါ — မှတ်ပုံတင်စောင့်ဆိုင်းချိန်နှင့် အမှတ်စဉ်စောင့်ချိန် လျှော့နည်းသွားမည်"],
    ],
    lookupLabel: "🔎 ကျွန်ုပ်၏ စာရင်းသွင်းမှုကို စစ်ကြည့်ရန်",
    lookupPh: "စာရင်းသွင်းမှုကုဒ် ဥပမာ RV-261015-257",
    lookupBtn: "ကြည့်ရန်",
  },
};

export default function HomePage() {
  const [lang] = useLang();
  const L = T[lang];
  const C = lang === "th" ? CONFIG : CONFIG[lang];
  const router = useRouter();
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState("");

  function checkBooking(e) {
    e.preventDefault();
    const code = lookup.trim().toUpperCase();
    if (code) router.push("/success?code=" + encodeURIComponent(code));
  }

  useEffect(() => {
    document.title = L.title;
    api("/api/services")
      .then(({ services }) => setServices(services))
      .catch(() => setError(L.loadErr));
  }, [lang]);

  return (
    <>
      <SiteHeader activePage="home" />
      <section className="hero">
        <div className="container">
          <span className="hero-eyebrow">{L.eyebrow}</span>
          <h1>{L.h1a}<br />{L.h1b}</h1>
          <p>{C.tagline}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#services">{L.cta}</a>
            <Link className="btn btn-ghost" href="/login">{L.staff}</Link>
          </div>
          {/* กลับมาดูการจองอีกครั้งด้วยรหัส — เผื่อผู้จองปิด/รีเฟรชหน้าสำเร็จไปแล้ว */}
          <form className="lookup-box" onSubmit={checkBooking}>
            <span className="lookup-label">{L.lookupLabel}</span>
            <input className="lookup-input" value={lookup} onChange={(e) => setLookup(e.target.value)}
              placeholder={L.lookupPh} />
            <button className="btn btn-primary btn-sm" type="submit">{L.lookupBtn}</button>
          </form>
        </div>
      </section>

      <main className="container">
        <h2 className="section-title" id="services">{L.svcTitle}</h2>
        <p className="section-sub">{L.svcSub}</p>
        <div className="service-grid">
          {services === null && !error && <p className="hint">{L.loading}</p>}
          {error && <p className="hint">{error}</p>}
          {services && services.length === 0 && <p className="hint">{L.empty}</p>}
          {services && services.map((s) => (
            <Link className="service-card" key={s.id} href={`/booking?service=${s.id}`}>
              <span className="service-icon">{s.icon}</span>
              <h3>{pickSvc(lang, s.name, s.nameEn)}</h3>
              <p>{pickSvc(lang, s.desc, s.descEn)}</p>
              <span className="service-cta">{L.book}</span>
            </Link>
          ))}
        </div>

        <h2 className="section-title">{L.stepsTitle}</h2>
        <p className="section-sub">{L.stepsSub}</p>
        <div className="steps-row">
          {L.steps.map(([h, p], i) => (
            <div className="step-card" key={i}><span className="step-num">{i + 1}</span><div><h4>{h}</h4><p>{p}</p></div></div>
          ))}
        </div>
      </main>

      <SiteFooter withPhone />
    </>
  );
}
