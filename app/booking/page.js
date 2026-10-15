"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader.js";
import SiteFooter from "@/components/SiteFooter.js";
import ThDatePicker from "@/components/ThDatePicker.js";
import { api, toISO, phoneOk, emailOk, useEmbed, svcDays, fmtDays } from "@/lib/client.js";
import { CONFIG } from "@/lib/config.js";
import { useLang, fmtFull, tErr, pickSvc } from "@/lib/i18n.js";

// ข้อความหน้าจอง 3 ภาษา — สลับได้จากปุ่มบนหัวเว็บ (จำค่าไว้ในเครื่องของผู้ใช้)
const T = {
  th: {
    title: "จองคิว — " + CONFIG.hospitalName,
    stepsSlot: ["เลือกบริการ", "เลือกวัน–เวลา", "ข้อมูลผู้จอง"],
    stepsCallback: ["เลือกบริการ", "ข้อมูลผู้ขอ (รอ รพ. ติดต่อกลับ)"],
    h1Callback: "ขอให้โรงพยาบาลติดต่อกลับ", h1Slot: "จองคิวล่วงหน้า",
    subCallback: "เลือกบริการ กรอกข้อมูลติดต่อ แล้วรอเจ้าหน้าที่โทรกลับนัดวัน–เวลาให้",
    subSlot: "กรอกข้อมูล 3 ขั้นตอน ใช้เวลาไม่ถึง 1 นาที",
    s1h2: "เลือกบริการที่ต้องการ", s1hint: "เลือกหมวดบริการ แล้วเลือกรายการที่ต้องการจอง", itemLabel: "รายการ",
    s2h2: "เลือกวันและเวลา", s2hint: "เลือกวันที่สะดวก แล้วเลือกช่วงเวลาที่ยังว่าง", dateLabel: "เลือกวันนัด",
    datePicked: "วันที่เลือก: ", dateRange: "เลือกได้ตั้งแต่วันนี้จนถึงอีก ",
    dateRangeSuffix: " วันข้างหน้า",
    openDaysHint: (d) => <>📅 บริการนี้เปิดให้บริการเฉพาะวัน <b>{d}</b> — วันอื่นจะเลือกในปฏิทินไม่ได้</>,
    slotPrompt: "↑ เลือกวันที่ด้านบนก่อนนะครับ แล้วช่วงเวลาที่ว่างจะขึ้นมาให้เลือก",
    full: "เต็ม", left: (n) => "เหลือ " + n + " ที่", summary: (svc, date, time) => `สรุป: ${svc} · ${date} เวลา ${time} น.`,
    errRange: (n) => "เลือกวันที่ในช่วงที่เปิดให้จองเท่านั้น (วันนี้ – อีก " + n + " วัน)",
    errDays: (d) => "บริการนี้เปิดให้จองเฉพาะวัน " + d + " เท่านั้น",
    s3h2Callback: "ข้อมูลผู้ขอให้ติดต่อกลับ", s3h2: "ข้อมูลผู้จอง",
    s3hintCallback: "โรงพยาบาลจะโทรกลับเพื่อนัดวัน–เวลาให้ในช่วงที่สะดวก",
    s3hint: "ข้อมูลจะใช้เพื่อยืนยันตัวตนที่เคาน์เตอร์ลงทะเบียนเท่านั้น",
    fName: "ชื่อ–นามสกุล / ชื่อรอง (ชาวต่างชาติใส่ชื่อตามหนังสือเดินทาง)", fNamePh: "เช่น สมหญิง ใจดี หรือ Aye Chan", fNameErr: "กรุณากรอกชื่อ",
    fContact: "ช่องทางการติดต่อ", fContactPh: "0812345678 / +959… หรือ name@email.com",
    fContactErr: "กรุณากรอกเบอร์โทรหรืออีเมลให้ถูกต้อง เช่น 0812345678, +959… หรือ name@email.com",
    fContactHint: "ใส่เบอร์โทรหรืออีเมลก็ได้ — โรงพยาบาลจะใช้ช่องทางนี้ติดต่อยืนยัน/กลับหาท่าน",
    fRights: "สิทธิการรักษา", fNote: "หมายเหตุ (ถ้ามี)", fNotePh: "เช่น ต้องการล่ามภาษาพม่า",
    consent: <>ข้าพเจ้ายินยอมให้ทางโรงพยาบาลเก็บและใช้ข้อมูลข้างต้น เพื่อการจัดคิวรับบริการและการติดต่อยืนยันนัดเท่านั้น ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA){" "}</>,
    readMore: "อ่านต่อ", consentErr: "กรุณาติ๊กยินยอมการเก็บข้อมูลก่อนจอง",
    back: "← ย้อนกลับ", next: "ถัดไป", busy: "กำลังบันทึก…", confirm: "ยืนยันการจอง ✓", sendCb: "ส่งคำขอ ✓",
    pdpaTitle: "🔒 การคุ้มครองข้อมูลส่วนบุคคล (PDPA)", pdpaSub: "รายละเอียดการเก็บและใช้ข้อมูลของท่านในระบบจองคิวนี้", pdpaClose: "เข้าใจแล้ว ปิดหน้าต่าง",
    pdpa: [
      ["1. ผู้ควบคุมข้อมูล: ", null],
      ["2. ข้อมูลที่เก็บ: ", "ชื่อ–นามสกุล เบอร์โทรศัพท์ อีเมล (ถ้ากรอก) สิทธิการรักษา บริการและวัน–เวลาที่เลือก และหมายเหตุที่ท่านแจ้ง"],
      ["3. วัตถุประสงค์: ", "เพื่อการจัดคิวการรับบริการและการติดต่อยืนยันนัดเท่านั้น"],
      ["4. ระยะเวลาเก็บรักษา: ", "เท่าที่จำเป็นเพื่อวัตถุประสงค์ข้างต้น"],
      ["5. การเปิดเผยข้อมูล: ", "เข้าถึงได้เฉพาะเจ้าหน้าที่ที่เกี่ยวข้องกับการจัดคิวเท่านั้น และจะไม่เปิดเผยแก่บุคคลภายนอก เว้นแต่ตามที่กฎหมายกำหนด"],
      ["6. สิทธิของท่าน: ", `ท่านมีสิทธิขอดูหรือขอสำเนาข้อมูล ขอให้แก้ไข ขอให้ลบ และเพิกถอนความยินยอมได้ โดยติดต่อที่เคาน์เตอร์บริการของโรงพยาบาล หรือโทร ${CONFIG.phone} — หากไม่ให้ความยินยอม ระบบจะไม่สามารถจัดคิวการรับบริการให้ท่านได้`],
    ],
  },
  en: {
    title: "Booking — " + CONFIG.en.hospitalName,
    stepsSlot: ["Choose service", "Date & time", "Your details"],
    stepsCallback: ["Choose service", "Your details (awaiting call back)"],
    h1Callback: "Request a call back", h1Slot: "Book an appointment",
    subCallback: "Choose a service and leave your contact details — our staff will call you back to arrange a date and time",
    subSlot: "3 quick steps — takes less than a minute",
    s1h2: "Choose a service", s1hint: "Pick a service category, then choose the item you want", itemLabel: "Item",
    s2h2: "Choose date & time", s2hint: "Pick a convenient date, then choose an available time", dateLabel: "Appointment date",
    datePicked: "Selected: ", dateRange: "You can book from today up to ",
    dateRangeSuffix: " days ahead",
    openDaysHint: (d) => <>📅 This service is available only on <b>{d}</b> — other days are disabled in the calendar</>,
    slotPrompt: "↑ Pick a date above first — available times will appear here",
    full: "Full", left: (n) => n + " left", summary: (svc, date, time) => `Summary: ${svc} · ${date} at ${time}`,
    errRange: (n) => "Please pick a date within the booking window (today – " + n + " days ahead)",
    errDays: (d) => "This service accepts bookings on " + d + " only",
    s3h2Callback: "Contact details", s3h2: "Your details",
    s3hintCallback: "The hospital will call you back to arrange a date and time that suits you",
    s3hint: "Your details are used only to identify you at the registration counter",
    fName: "Full name / nickname (foreigners: name as in passport)", fNamePh: "e.g. Somchai Jaidee or Aye Chan", fNameErr: "Please enter your name",
    fContact: "Contact", fContactPh: "0812345678 / +959… or name@email.com",
    fContactErr: "Please enter a valid phone number or email, e.g. 0812345678, +959… or name@email.com",
    fContactHint: "Phone or email — the hospital will use it to confirm or reach you",
    fRights: "Payment / coverage", fNote: "Note (optional)", fNotePh: "e.g. need a Burmese interpreter",
    consent: <>I consent to the hospital collecting and using the information above solely for queue management and appointment confirmation, in accordance with the Personal Data Protection Act (PDPA).{" "}</>,
    readMore: "Read more", consentErr: "Please tick the consent box before booking",
    back: "← Back", next: "Next", busy: "Saving…", confirm: "Confirm booking ✓", sendCb: "Send request ✓",
    pdpaTitle: "🔒 Personal Data Protection (PDPA)", pdpaSub: "How your data is collected and used in this booking system", pdpaClose: "I understand — close",
    pdpa: [
      ["1. Data controller: ", null],
      ["2. Data collected: ", "full name, phone number, email (if provided), payment/coverage, chosen service, date and time, and any note you provide"],
      ["3. Purpose: ", "queue management and appointment confirmation only"],
      ["4. Retention: ", "as long as necessary for the purposes above"],
      ["5. Disclosure: ", "accessible only to staff involved in queue management; not disclosed to outside parties except as required by law"],
      ["6. Your rights: ", `you may request access to or a copy of your data, request correction or deletion, and withdraw consent at the hospital service counter or by calling ${CONFIG.phone} — without consent the system cannot arrange a queue for you`],
    ],
  },
  my: {
    title: "စာရင်းသွင်းခြင်း — " + CONFIG.my.hospitalName,
    stepsSlot: ["ဝန်ဆောင်မှု ရွေးပါ", "ရက်စွဲ–အချိန်", "သင့်အချက်အလက်"],
    stepsCallback: ["ဝန်ဆောင်မှု ရွေးပါ", "သင့်အချက်အလက် (ပြန်ခေါ်ရန် စောင့်ဆိုင်း)"],
    h1Callback: "ဆေးရုံမှ ပြန်ခေါ်ရန် တောင်းဆိုပါ", h1Slot: "ကြိုတင်အချိန်ယူပါ",
    subCallback: "ဝန်ဆောင်မှု ရွေးပြီး ဆက်သွယ်ရန် အချက်အလက် ဖြည့်ပါ — ဝန်ထမ်းမှ ပြန်ခေါ်၍ ရက်စွဲ–အချိန် သတ်မှတ်ပေးမည်",
    subSlot: "အဆင့် ၃ ဆင့်ဖြင့် ဖြည့်ပါ — ၁ မိနစ်လည်း မကျော်ပါ",
    s1h2: "လိုအပ်သော ဝန်ဆောင်မှုကို ရွေးပါ", s1hint: "ဝန်ဆောင်မှု အမျိုးအစား ရွေးပြီးလျှင် စာရင်းသွင်းလိုသော အကြောင်းအရာကို ရွေးပါ", itemLabel: "အကြောင်းအရာ",
    s2h2: "ရက်စွဲနှင့် အချိန် ရွေးပါ", s2hint: "သင့်ကို အဆင်ပြေသော ရက်စွဲကို ရွေးပြီး ကျန်ရှိနေသော အချိန်ကို ရွေးပါ", dateLabel: "သွားရောက်မည့် ရက်စွဲ",
    datePicked: "ရွေးချယ်ထားသော ရက်စွဲ: ", dateRange: "ယနေ့မှစ၍ ",
    dateRangeSuffix: " ရက်အတွင်း ရွေးနိုင်သည်",
    openDaysHint: (d) => <>📅 ဤဝန်ဆောင်မှုသည် <b>{d}</b> သာ ဖွင့်ပေးသည် — အခြားရက်များကို ပြက္ခဒိန်တွင် ရွေး၍ မရပါ</>,
    slotPrompt: "↑ အထက်တွင် ရက်စွဲကို အရင်ရွေးပါ — ကျန်ရှိသော အချိန်များ ဤနေရာတွင် ပေါ်လာမည်",
    full: "ပြည့်နေပါပြီ", left: (n) => n + " နေရာ ကျန်သည်", summary: (svc, date, time) => `အနှစ်ချုပ်: ${svc} · ${date} · ${time} နာရီ`,
    errRange: (n) => "စာရင်းသွင်းနိုင်သော ကာလအတွင်းရှိ ရက်စွဲကိုသာ ရွေးပါ (ယနေ့ – နောက်ထပ် " + n + " ရက်)",
    errDays: (d) => "ဤဝန်ဆောင်မှုသည် " + d + " သာ စာရင်းပေးနိုင်သည်",
    s3h2Callback: "ပြန်လည်ဆက်သွယ်ရန် အချက်အလက်", s3h2: "သင့်အချက်အလက်",
    s3hintCallback: "ဆေးရုံမှ သင့်အဆင်ပြေသော ရက်စွဲ–အချိန် သတ်မှတ်ပေးရန် ပြန်ခေါ်ပါမည်",
    s3hint: "အချက်အလက်ကို မှတ်ပုံတင်ကောင်တာတွင် သင့်ကိုယ်သင် အတည်ပြုရန်သာ အသုံးပြုပါမည်",
    fName: "အမည် (နိုင်ငံခြားသားများ — ပါစပေါ့ပေါ်ရှိ အမည်အတိုင်း ဖြည့်ပါ)", fNamePh: "ဥပမာ Aye Chan သို့ မော်ဝင်း", fNameErr: "ကျေးဇူးပြု၍ အမည်ကို ဖြည့်ပါ",
    fContact: "ဆက်သွယ်ရန်", fContactPh: "0812345678 / +959… သို့ name@email.com",
    fContactErr: "ဖုန်းနံပါတ် သို့မဟုတ် အီးမေးလ် မှန်ကန်စွာ ရိုက်ထည့်ပါ — ဥပမာ 0812345678, +959… သို့ name@email.com",
    fContactHint: "ဖုန်း သို့မဟုတ် အီးမေးလ် — ဆေးရုံမှ ဤနေရာဖြင့် အတည်ပြု/ပြန်ဆက်သွယ်ပါမည်",
    fRights: "ကုသခံခွင့် အမျိုးအစား", fNote: "မှတ်ချက် (ရှိလျှင်)", fNotePh: "ဥပမာ မြန်မာစကားပြန် လိုအပ်သည်",
    consent: <>ကျွန်ုပ်သည် အထက်ပါ အချက်အလက်များကို အမှတ်စဉ် စီမံခန့်ခွဲမှုနှင့် ရက်ချိန်းအတည်ပြုခြင်းအတွက်သာ ဆေးရုံမှ စုဆောင်း အသုံးပြုခွင့်ပြုသည် — ပုဂ္ဂလိကအချက်အလက် ကာကွယ်ရေး ဥပဒေ (PDPA) အရ{" "}</>,
    readMore: "ပိုမိုဖတ်ရှိရန်", consentErr: "ကျေးဇူးပြု၍ သဘောတူညီမှုကို ရွေးချယ်ပါ",
    back: "← နောက်သို့", next: "ရှေ့သို့", busy: "သိမ်းဆည်းနေသည်…", confirm: "စာရင်းသွင်းမှု အတည်ပြုပါ ✓", sendCb: "တောင်းဆိုမှု ပို့ပါ ✓",
    pdpaTitle: "🔒 ပုဂ္ဂလိကအချက်အလက် ကာကွယ်ရေး (PDPA)", pdpaSub: "ဤစာရင်းသွင်းမှုစနစ်တွင် သင့်အချက်အလက်ကို မည်သို့ စုဆောင်း၍ အသုံးပြုသည်ကို ဖော်ပြထားသည်", pdpaClose: "နားလည်ပါပြီ — ပိတ်ပါ",
    pdpa: [
      ["၁။ အချက်အလက် စီမံခန့်ခွဲသူ: ", null],
      ["၂။ စုဆောင်းသော အချက်အလက်: ", "အမည်၊ ဖုန်းနံပါတ်၊ အီးမေးလ် (ဖြည့်ထားပါက)، ကုသခံခွင့် အမျိုးအစား၊ ရွေးချယ်သော ဝန်ဆောင်မှုနှင့် ရက်စွဲ–အချိန်၊ သင်ပေးထားသော မှတ်ချက်"],
      ["၃။ ရည်ရွယ်ချက်: ", "အမှတ်စဉ် စီမံခန့်ခွဲခြင်းနှင့် ရက်ချိန်း အတည်ပြုခြင်းအတွက်သာ"],
      ["၄။ သိမ်းဆည်းချိန်: ", "အထက်ပါ ရည်ရွယ်ချက်များအတွက် လိုအပ်သည့် ကာလအတွင်းသာ"],
      ["၅။ ထုတ်ဖော်ပြသမှု: ", "အမှတ်စဉ်စီမံခန့်ခွဲမှုနှင့် ဆက်စပ်သော ဝန်ထမ်းများသာ ကြည့်နိုင်သည် — ဥပဒေဖြင့် သတ်မှတ်ထားသည်မှအပ ပြင်ပပုဂ္ဂိုလ်များထံ မထုတ်ပြပါ"],
      ["၆။ သင့်အခွင့်အရေး: ", `သင့်အချက်အလက်ကို ကြည့်ရှုခွင့်/မိတ္တူယူခွင့်၊ ပြင်ဆင်ပေးရန်၊ ဖျက်ပေးရန်နှင့် သဘောတူညီမှု ပြန်ရုပ်သိမ်းရန် တောင်းဆိုနိုင်သည် — ဆေးရုံ ဝန်ဆောင်မှုကောင်တာတွင်ဖြစ်စေ၊ ${CONFIG.phone} သို့ ဖုန်းဆက်၍ဖြစ်စေ ဆက်သွယ်ပါ — သဘောမတူပါက စနစ်က သင့်အတွက် အမှတ်စဉ် စီစဉ်ပေး၍ မရပါ`],
    ],
  },
};

// สิทธิการรักษา (ค่าเริ่มต้นจาก config/หลังบ้าน เป็นไทย) — แปลเป็นพม่าสำหรับโหมด MY, ที่แปลไม่ได้แสดงอังกฤษหรือไทยตามลำดับ
const RIGHTS_MY = {
  "ชำระเงินเอง": "ကိုယ်တိုင် ငွေချေသည်",
  "ประกันสังคม": "လူမှုဖူလုံရေး အာမခံ",
  "หลักประกันสุขภาพ (บัตรทอง)": "ကျန်းမာရေး အာမခံ (ရွှေကတ်)",
  "ประกันเอกชน": "ပုဂ္ဂလိက အာမခံ",
  "อื่น ๆ": "အခြား",
};

// วันให้บริการแบบย่อภาษาอังกฤษ เช่น Mon–Fri (โครงสร้างเดียวกับ fmtDays ของฝั่งไทย)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS_EN = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 0: "Sun" };
function fmtDaysEn(days) {
  const sorted = DAY_ORDER.filter((d) => days.includes(d));
  if (sorted.length === 7) return "every day";
  const runs = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && DAY_ORDER[(DAY_ORDER.indexOf(last[last.length - 1]) + 1) % 7] === d) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length > 2 ? `${DAY_LABELS_EN[r[0]]}–${DAY_LABELS_EN[r[r.length - 1]]}` : r.map((x) => DAY_LABELS_EN[x]).join(" "))).join(", ");
}

// แบบเดียวกันในภาษาพม่า — ใช้ชื่อวันเต็มเพราะภาษาพม่าไม่มีรูปย่อที่คนทั่วไปคุ้นเคย
const DAY_LABELS_MY = { 1: "တနင်္လာ", 2: "အင်္ဂါ", 3: "ဗုဒ္ဓဟူး", 4: "ကြာသပတေး", 5: "သောကြာ", 6: "စနေ", 0: "တနင်္ဂနွေ" };
function fmtDaysMy(days) {
  const sorted = DAY_ORDER.filter((d) => days.includes(d));
  if (sorted.length === 7) return "နေ့တိုင်း";
  const runs = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && DAY_ORDER[(DAY_ORDER.indexOf(last[last.length - 1]) + 1) % 7] === d) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length > 2 ? `${DAY_LABELS_MY[r[0]]}–${DAY_LABELS_MY[r[r.length - 1]]}` : r.map((x) => DAY_LABELS_MY[x]).join(" "))).join(", ");
}

export default function BookingPage() {
  const router = useRouter();
  const embed = useEmbed();
  const [lang] = useLang();
  const L = T[lang];
  const [services, setServices] = useState([]);
  const [daysAheadCfg, setDaysAheadCfg] = useState(CONFIG.daysAhead || 14);
  // สิทธิการรักษา [{th, en}] — โหลดจากค่าตั้งหลังบ้าน (fallback ไปค่าเริ่มต้นใน config ถ้ายังไม่ได้ตั้ง)
  const [rightsOpts, setRightsOpts] = useState([]);
  const [errMsg, setErrMsg] = useState("");
  const [showPdpa, setShowPdpa] = useState(false); // popup รายละเอียดการคุ้มครองข้อมูล (PDPA มาตรา 23)
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [dateISO, setDateISO] = useState("");
  const [time, setTime] = useState(null);
  const [availability, setAvailability] = useState({});
  // ฟอร์มขั้นตอน 3
  const [form, setForm] = useState({ name: "", contact: "", rights: CONFIG.rightsOptions[0], note: "", consent: false });
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);

  const service = services.find((s) => s.id === serviceId);
  const item = service && service.items.find((i) => i.id === itemId);
  // วันที่บริการนี้เปิดรับจอง (จ อ พ พฤ ศ ส อา) — ตั้งในหลังบ้าน ไม่ตั้ง = ทุกวัน
  const openDays = svcDays(service);
  // บริการประเภท "ให้ รพ. ติดต่อกลับ" — ไม่ต้องเลือกวัน/เวลา กรอกข้อมูลแล้วรอโทรกลับ (2 ขั้นตอน)
  const isCallback = !!(service && service.bookingMode === "callback");
  const STEP_LABELS = isCallback ? L.stepsCallback : L.stepsSlot;
  const svcName = (s) => pickSvc(lang, s && s.name, s && s.nameEn);
  const dayList = () => (lang === "en" ? fmtDaysEn(openDays) : lang === "my" ? fmtDaysMy(openDays) : fmtDays(openDays));
  const C = lang === "th" ? CONFIG : CONFIG[lang]; // ชื่อ รพ. ฯลฯ ตามภาษาที่เลือก

  useEffect(() => {
    document.title = L.title;
  }, [lang]);

  useEffect(() => {
    api("/api/config").then(({ daysAhead, rights }) => {
      setDaysAheadCfg(daysAhead);
      if (Array.isArray(rights) && rights.length) {
        setRightsOpts(rights);
        setForm((f) => (rights.some((r) => r.th === f.rights) ? f : { ...f, rights: rights[0].th }));
      }
    }).catch(() => {});
    api("/api/services").then(({ services }) => {
      setServices(services);
      // ลิงก์จากหน้าแรกส่ง ?service=<id> มา — เลือกให้เลย
      const preset = new URLSearchParams(window.location.search).get("service");
      const pre = preset && services.find((s) => s.id === preset && s.active !== false);
      if (pre) { setServiceId(pre.id); setItemId(pre.items[0].id); }
    }).catch((e) => setErrMsg(e.message));
  }, []);

  // แสดง error — ถ้าอยู่โหมด EN แปลข้อความจาก server (ที่ส่งเป็นไทย) ให้อัตโนมัติ
  const showErr = (msg) => { const m = tErr(msg, lang); setErrMsg(m); if (m) window.scrollTo({ top: 0, behavior: "smooth" }); };
  // ขั้นที่ 1 ไปต่อได้เมื่อเลือกบริการแล้ว (บริการที่ไม่มีรายการย่อยไม่ต้องเลือกรายการ)
  const noItems = !!(service && (!service.items || !service.items.length));
  const canProceed = step === 1 ? !!(serviceId && (noItems || itemId)) : (step === 2 && !isCallback) ? !!(dateISO && time) : true;
  const nextLabel = (isCallback ? step === 2 : step === 3) ? (busy ? L.busy : isCallback ? L.sendCb : L.confirm) : L.next;

  function pickService(id) {
    const s = services.find((x) => x.id === id);
    setServiceId(id);
    setItemId(s.items && s.items.length ? s.items[0].id : null); // บริการไม่มีรายการย่อย (optional) — ข้ามไปเลย
    setDateISO(""); setTime(null); setAvailability({});
  }

  async function pickDate(iso) {
    setTime(null);
    const min = toISO(new Date());
    const max = toISO(new Date(Date.now() + daysAheadCfg * 864e5));
    if (!iso || iso < min || iso > max) {
      setDateISO(""); setAvailability({});
      if (iso) showErr(L.errRange(daysAheadCfg));
      return;
    }
    if (!openDays.includes(new Date(iso + "T00:00:00").getDay())) {
      setDateISO(""); setAvailability({});
      showErr(L.errDays(dayList()));
      return;
    }
    showErr("");
    setDateISO(iso);
    try {
      const { slots } = await api(`/api/availability?service=${serviceId}&date=${iso}`);
      setAvailability(Object.fromEntries(slots.map((x) => [x.time, x.remaining])));
    } catch (e) { showErr(e.message); }
  }

  // ช่องทางติดต่อช่องเดียว — ผู้ป่วยใส่เบอร์หรืออีเมลก็ได้ ตรวจฟอร์แมตรวมกัน แล้วแยกเก็บให้ถูกฟิลด์ตอนส่ง
  const contactVal = form.contact.trim();
  const contactOkVal = phoneOk(contactVal) || emailOk(contactVal);
  const formValid = form.name.trim() && contactOkVal && form.consent;
  const contactFieldInvalid = touched.contact && !contactOkVal;

  async function next() {
    if (step === 1 && canProceed) { setStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (step === 2 && !isCallback && canProceed) { setStep(3); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if ((isCallback && step === 2) || step === 3) {
      setTouched({ name: true, contact: true, consent: true });
      if (!formValid) return;
      setBusy(true); showErr("");
      try {
        const r = await api("/api/bookings", { method: "POST", body: JSON.stringify({
          serviceId, itemId: itemId || undefined,
          ...(isCallback ? {} : { date: dateISO, time }),
          name: form.name.trim(),
          ...(emailOk(contactVal) ? { email: contactVal } : { phone: contactVal }),
          rights: form.rights,
          note: form.note.trim(), consent: true,
        })});
        router.push("/success?code=" + encodeURIComponent(r.code));
      } catch (e) {
        showErr(e.message);
        setBusy(false);
      }
    }
  }

  const slotTimes = useMemo(() => Object.keys(availability).sort(), [availability]);
  const isToday = dateISO === toISO(new Date());
  const nowHHMM = String(new Date().getHours()).padStart(2, "0") + String(new Date().getMinutes()).padStart(2, "0");

  return (
    <>
      {!embed && <SiteHeader activePage="booking" />}
      <main className="container">
        <div className="wizard-head">
          <h1>{isCallback ? L.h1Callback : L.h1Slot}</h1>
          <p>{isCallback ? L.subCallback : L.subSlot}</p>
        </div>

        <div className="progress-steps">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const cls = n === step ? "active" : n < step ? "done" : "";
            return (
              <span key={i} style={{ display: "contents" }}>
                <div className={"pstep " + cls}><span className="dot">{n < step ? "✓" : n}</span><span className="pstep-text">{label}</span></div>
                {n < STEP_LABELS.length && <div className="pstep-line"></div>}
              </span>
            );
          })}
        </div>
        {errMsg && <div className="err-box" style={{ display: "block" }}>⚠️ {errMsg}</div>}

        {step === 1 && (
          <section className="wizard-card">
            <h2>{L.s1h2}</h2>
            <p className="hint">{L.s1hint}</p>
            <div className="pick-grid">
              {services.filter((s) => s.active !== false).map((s) => (
                <button type="button" key={s.id} className={"pick-card" + (s.id === serviceId ? " selected" : "")} onClick={() => pickService(s.id)}>
                  <span className="pi">{s.icon}</span>
                  <span><h4>{svcName(s)}</h4><span className="d">{(pickSvc(lang, s.desc, s.descEn) || "").slice(0, 46)}…</span></span>
                </button>
              ))}
            </div>
            {service && !!service.items.length && (
              <div className="item-row" style={{ display: "block" }}>
                <label htmlFor="itemSelect">{L.itemLabel}</label>
                <select className="item-select" id="itemSelect" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {service.items.map((i) => <option key={i.id} value={i.id}>{pickSvc(lang, i.name, i.nameEn)}</option>)}
                </select>
                <div className="item-price">{item ? pickSvc(lang, item.name, item.nameEn) : ""}</div>
              </div>
            )}
          </section>
        )}

        {step === 2 && !isCallback && (
          <section className="wizard-card">
            <h2>{L.s2h2}</h2>
            <p className="hint">{L.s2hint}</p>
            <div className="date-pick">
              <ThDatePicker
                label={L.dateLabel}
                value={dateISO}
                onChange={pickDate}
                minDate={new Date()}
                maxDate={new Date(Date.now() + daysAheadCfg * 864e5)}
                shouldDisableDate={(d) => !openDays.includes(d.getDay())}
                size="medium"
                sx={{ width: 240 }}
              />
              <span className="hint">{dateISO ? L.datePicked + fmtFull(dateISO, lang) : L.dateRange + daysAheadCfg + L.dateRangeSuffix}</span>
            </div>
            {openDays.length < 7 && (
              <p className="hint" style={{ margin: "0 0 10px" }}>{L.openDaysHint(dayList())}</p>
            )}
            <div className="slot-grid">
              {!dateISO ? (
                <p style={{ color: "var(--muted)", gridColumn: "1/-1", margin: "6px 0" }}>{L.slotPrompt}</p>
              ) : slotTimes.map((t) => {
                const left = availability[t];
                const disabled = left <= 0 || (isToday && t.replace(":", "") <= nowHHMM);
                return (
                  <button type="button" key={t} className={"slot-btn" + (t === time ? " selected" : "")} disabled={disabled} onClick={() => setTime(t)}>
                    <span className="t">{t}</span>
                    <span className="r">{left <= 0 ? L.full : L.left(left)}</span>
                  </button>
                );
              })}
            </div>
            {dateISO && time && (
              <div className="summary-box show">{L.summary(svcName(service), fmtFull(dateISO, lang), time)}</div>
            )}
          </section>
        )}

        {((isCallback && step === 2) || step === 3) && service && (!service.items.length || item) && (
          <section className="wizard-card">
            <h2>{isCallback ? L.s3h2Callback : L.s3h2}</h2>
            <p className="hint">{isCallback ? L.s3hintCallback : L.s3hint}</p>
            <div className="form-grid">
              <div className={"form-field full" + (touched.name && !form.name.trim() ? " invalid" : "")}>
                <label htmlFor="fName">{L.fName}</label>
                <input className="form-input" id="fName" type="text" placeholder={L.fNamePh} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <span className="err">{L.fNameErr}</span>
              </div>
              <div className={"form-field" + (contactFieldInvalid ? " invalid" : "")}>
                <label htmlFor="fContact">{L.fContact}</label>
                <input className="form-input" id="fContact" type="text" placeholder={L.fContactPh} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} onBlur={() => setTouched({ ...touched, contact: true })} />
                <span className="hint" style={{ color: "var(--muted)" }}>📞✉️ {L.fContactHint}</span>
                <span className="err">{L.fContactErr}</span>
              </div>
              <div className="form-field">
                <label htmlFor="fRights">{L.fRights}</label>
                <select className="form-select" id="fRights" value={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.value })}>
                  {(rightsOpts.length ? rightsOpts : CONFIG.rightsOptions.map((r) => ({ th: r }))).map((r) => (
                    <option key={r.th} value={r.th}>{lang === "my" ? (RIGHTS_MY[r.th] || r.en || r.th) : lang === "en" ? (r.en || r.th) : r.th}</option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label htmlFor="fNote">{L.fNote}</label>
                <input className="form-input" id="fNote" type="text" placeholder={L.fNotePh} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className={"form-field full" + (touched.consent && !form.consent ? " invalid" : "")}>
                <label className="consent-box">
                  <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                  <span>{L.consent}
                    <button type="button" className="pdpa-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPdpa(true); }}>{L.readMore}</button>
                  </span>
                </label>
                <span className="err">{L.consentErr}</span>
              </div>
            </div>
          </section>
        )}

        <div className="wizard-nav">
          <button className="btn btn-ghost" type="button" style={{ visibility: step === 1 ? "hidden" : "visible" }} onClick={() => setStep(step - 1)}>{L.back}</button>
          <button className="btn btn-primary" type="button" disabled={!canProceed || busy} onClick={next}>{nextLabel}</button>
        </div>
      </main>

      {/* popup รายละเอียดการคุ้มครองข้อมูลส่วนบุคคล — ครบองค์ประกอบการแจ้งตาม PDPA มาตรา 23 */}
      {showPdpa && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setShowPdpa(false); }}>
          <div className="modal-box pdpa-modal">
            <h2>{L.pdpaTitle}</h2>
            <p className="hint">{L.pdpaSub}</p>
            <div className="pdpa-body">
              {L.pdpa.map(([h, body], i) => (
                <p key={i}><b>{h}</b>{i === 0 ? C.hospitalName : " " + body}</p>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowPdpa(false)}>{L.pdpaClose}</button>
            </div>
          </div>
        </div>
      )}
      {!embed && <SiteFooter />}
    </>
  );
}
