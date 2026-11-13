"use strict";
// ============================================================
// lib/banner.js — สร้าง "รูปแบนเนอร์" เริ่มต้นให้แต่ละบริการ (SVG → base64 data-URL)
//
// เหตุผล: ผู้ใช้ต้องการให้การ์ดทุกใบ "มีรูป" — แต่ระบบไม่มีรูปถ่ายจริงติดมา
// จึงสร้างกราฟิกแบนเนอร์สวย ๆ (พื้นไล่สี + ลายกราฟิกทางการแพทย์) ให้เป็นค่าเริ่มต้น
// แต่ละบริการได้สี+ลายไม่ซ้ำกัน ดูเป็นรูปจริง และเจ้าหน้าที่อัปโหลดรูปถ่ายแทนที่
// จากหลังบ้านได้ตลอดเวลา (ช่อง "รูปบริการ")
//
// ใช้ร่วมกัน 2 ที่:
//   1) lib/store.js — defaultServices() ใส่ image ให้บริการตอน seed ครั้งแรก
//   2) scripts/set-default-banners.js — อัปเดตรูปให้ข้อมูลที่มีอยู่แล้ว (ไม่ต้องลบ DB)
// ============================================================

// ลายกราฟิก (วาดเป็น vector สีขาว/สีธีม — ไม่ใช้ emoji กันปัญหาเรนเดอร์บน PC เก่า)
// พิกัดในพื้นที่ 200x200 จะถูกวางกึ่งกลางแบนเนอร์
const MOTIFS = {
  // ตรวจสุขภาพ — เส้นคลื่นหัวใจ (pulse)
  pulse: (c) => `<path d="M18 100 H66 L90 46 L120 156 L144 88 H182" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
  // ทันตกรรม — รูปฟัน
  tooth: (c) => `<path d="M100 24 C58 24 38 52 43 92 C48 132 60 178 77 178 C90 178 87 136 100 136 C113 136 110 178 123 178 C140 178 152 132 157 92 C162 52 142 24 100 24 Z" fill="#ffffff"/>`,
  // ความงาม — ดาวประกาย (sparkle)
  sparkle: (c) => `<path d="M96 18 L112 82 L176 98 L112 114 L96 178 L80 114 L16 98 L80 82 Z" fill="#ffffff"/><path d="M158 30 L165 56 L191 63 L165 70 L158 96 L151 70 L125 63 L151 56 Z" fill="#ffffff" opacity="0.85"/>`,
  // วัคซีน — โล่ + กากบาท (เกราะป้องกัน)
  shield: (c) => `<path d="M100 18 L168 45 V100 C168 144 139 171 100 182 C61 171 32 144 32 100 V45 Z" fill="#ffffff"/><path d="M88 66 h24 v24 h24 v24 h-24 v24 h-24 v-24 h-24 v-24 h24 z" fill="${c}"/>`,
  // แพทย์ทางเลือก — ใบสมุนไพร
  leaf: (c) => `<path d="M100 20 C152 50 160 118 100 180 C40 118 48 50 100 20 Z" fill="#ffffff"/><path d="M100 40 V162" stroke="${c}" stroke-width="9" stroke-linecap="round"/>`,
};

// ค่าสี + ลาย + คำบรรยายสั้น ต่อบริการ (คีย์ = service id)
const SERVICE_BANNERS = {
  healthcheck: { c1: "#13497f", c2: "#0693e3", motif: "pulse" },
  dental: { c1: "#0e7490", c2: "#22d3ee", motif: "tooth" },
  beauty: { c1: "#9d174d", c2: "#ec4899", motif: "sparkle" },
  vaccine: { c1: "#047857", c2: "#34d399", motif: "shield" },
  tcm: { c1: "#3f6212", c2: "#84cc16", motif: "leaf" },
};

function buildSvg({ c1, c2, motif }) {
  const draw = MOTIFS[motif] || MOTIFS.pulse;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<rect width="1200" height="760" fill="url(#bg)"/>` +
    // วงกลมตกแต่งจาง ๆ ให้ดูมีมิติ
    `<circle cx="1075" cy="110" r="230" fill="#ffffff" opacity="0.10"/>` +
    `<circle cx="985" cy="665" r="170" fill="#ffffff" opacity="0.07"/>` +
    `<circle cx="120" cy="700" r="150" fill="#ffffff" opacity="0.06"/>` +
    // วงกลมขาวรองลายกราฟิกกลางภาพ
    `<circle cx="600" cy="380" r="215" fill="#ffffff" opacity="0.14"/>` +
    `<g transform="translate(490,270) scale(1.1)">${draw(c1)}</g>` +
    `</svg>`
  );
}

// คืน base64 data-URL (เก็บลงฟิลด์ image ของบริการได้ทันที)
function bannerFor(serviceId) {
  const cfg = SERVICE_BANNERS[serviceId];
  if (!cfg) return undefined; // บริการที่เพิ่มเอง/ไม่รู้จัก → ไม่มีรูปเริ่มต้น (ใช้ fallback ไล่สี+ไอคอน)
  const svg = buildSvg(cfg);
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}

// ---------- แบนเนอร์ของ "รายการย่อย" (item) ----------
// ใช้ธีมสีของบริการต้นสังกัด + แสดง "ชื่อรายการ" เป็นตัวหนังสือกลางภาพ
// → แต่ละรายการย่อยได้รูปไม่ซ้ำกัน (ตามชื่อ) และกลมกลืนกับสีหมวดของมัน
const escXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const THAI_FONT = "Sarabun,'Noto Sans Thai','Leelawadee UI',Tahoma,sans-serif";

function itemBanner(serviceId, name) {
  const cfg = SERVICE_BANNERS[serviceId] || { c1: "#13497f", c2: "#0693e3", motif: "pulse" };
  const { c1, c2, motif } = cfg;
  const draw = MOTIFS[motif] || MOTIFS.pulse;
  const label = escXml(name || "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" font-family="${THAI_FONT}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<rect width="1200" height="760" fill="url(#bg)"/>` +
    `<circle cx="1080" cy="90" r="220" fill="#ffffff" opacity="0.10"/>` +
    `<circle cx="110" cy="680" r="190" fill="#ffffff" opacity="0.07"/>` +
    // ลายกราฟิกจาง ๆ มุมขวาบน ให้รู้ว่าอยู่หมวดไหน
    `<g transform="translate(955,70) scale(0.9)" opacity="0.16">${draw(c1)}</g>` +
    // ชื่อรายการกลางภาพ
    `<text x="600" y="372" text-anchor="middle" font-size="80" font-weight="700" fill="#ffffff">${label}</text>` +
    `<rect x="515" y="408" width="170" height="9" rx="4.5" fill="#ffffff" opacity="0.75"/>` +
    `</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}

module.exports = { bannerFor, itemBanner, SERVICE_BANNERS };
