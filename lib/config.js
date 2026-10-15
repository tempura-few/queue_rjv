// การตั้งค่าหน้าเว็บ (แก้ครั้งเดียวตอนติดตั้ง)
// หมายเหตุ: บริการ / ราคา / ช่วงเวลา แก้ได้จากหลังบ้าน ไม่ต้องแตะไฟล์นี้
export const CONFIG = {
  hospitalName: "โรงพยาบาลราชเวช เชียงใหม่",
  hospitalShortName: "RV",
  tagline: "จองคิวล่วงหน้าออนไลน์ สะดวก ไม่ต้องรอ",
  phone: "053-000-000", // ★ แก้เป็นเบอร์จริงของ รพ. ก่อนเปิดใช้
  company: "ดำเนินการภายใต้การบริหารของ บริษัท ศิริเวช เมดิคอล จำกัด",
  address: "316/1 ถ.เชียงใหม่-ลำพูน ต.วัดเกต อ.เมือง จ.เชียงใหม่ 50000",
  website: "https://rajavejchiangmai.com",
  daysAhead: 14,

  // ข้อความอังกฤษสำหรับหน้าเว็บผู้ป่วย (โหมด EN) — ชื่อบริการ/รายการย่อยเป็นข้อมูลในฐานข้อมูล จึงแสดงตามที่กรอกไว้
  en: {
    hospitalName: "Rajavej Chiang Mai Hospital",
    tagline: "Book your appointment online — quick and easy",
    company: "Operated by Siriwej Medical Co., Ltd.",
    address: "316/1 Chiang Mai–Lamphun Rd., Wat Ket, Mueang, Chiang Mai 50000",
    staffPage: "Staff Login",
    privacy: "Privacy Policy",
    cookies: "Cookie Policy",
    tel: "Tel.",
  },

  // ข้อความภาษาพม่าสำหรับหน้าเว็บผู้ป่วย (โหมด MY) — ชื่อบริการไม่มีข้อมูลพม่าในฐานข้อมูล จึงแสดงชื่ออังกฤษ (ถ้ามี) แทน
  my: {
    hospitalName: "ရာဇေဝတ် ချင်းမိုင်းဆေးရုံ",
    tagline: "အွန်လိုင်းဖြင့် ကြိုတင်အချိန်ယူနိုင် — လွယ်ကူ၍ စောင့်စရာမလို",
    company: "Siriwej Medical Co., Ltd. မှ စီမံခန့်ခွဲသည်",
    address: "၃၁၆/၁ ချင်းမိုင်း–လမ်ပွန်းလမ်း၊ ဝပ်ကက်၊ ချင်းမိုင်းမြို့နယ်၊ ချင်းမိုင်း ၅၀၀၀၀",
    staffPage: "ဆေးရုံဝန်ထမ်း ဝင်ရောက်ရန်",
    privacy: "ကိုယ်ရေးအချက်အလက် လုံခြုံမှု မူဝါဒ",
    cookies: "ကွတ်ကီး မူဝါဒ",
    tel: "ဖုန်း",
  },

  rightsOptions: [
    "ชำระเงินเอง",
    "ประกันสังคม",
    "หลักประกันสุขภาพ (บัตรทอง)",
    "ประกันเอกชน",
    "อื่น ๆ",
  ],

  channels: {
    online: { label: "ออนไลน์", cls: "ch-online", icon: "🌐" },
    walkin: { label: "Walk-in", cls: "ch-walkin", icon: "🚶" },
    agency: { label: "ตัวแทน", cls: "ch-agency", icon: "🤝" },
    callback: { label: "รอนัดหมาย", cls: "ch-callback", icon: "📞" },
  },

  // ใช้เป็นตัวช่วยเลือกในฟอร์มรับคิวเป็นชุด/นำเข้าไฟล์ (เพิ่ม/ลบก็ได้ ไม่ผูกกับ backend)
  agencyCodes: [
    { code: "AG-001", name: "ตัวแทนประกันสุขภาพดี" },
    { code: "AG-002", name: "บริษัท ตรวจสุขภาพพลัส จำกัด" },
    { code: "AG-003", name: "ทีมตลาดต่างชาติ" },
  ],
};
