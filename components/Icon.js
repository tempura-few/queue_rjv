"use client";
// ============================================================
// components/Icon.js — ไอคอน "สี" ทั้งระบบ
//
// เหตุผล: เครื่อง PC บางตัว (Windows เก่า/ไม่มี emoji font) แสดง emoji
// เป็นกล่องว่าง □□ — ไอคอน SVG เรนเดอร์เหมือนกันทุกเครื่อง
//
// แหล่งไอคอน 2 ชุด:
//   1) Icons8 "Flat Color" (react-icons/fc — ไอคอนสีสไตล์ icons8, MIT)
//      สำหรับไอคอน UI คงที่ (เมนู/ปุ่ม/หัวข้อ)
//   2) Fluent UI Emoji SVG ของ Microsoft (MIT — ไม่ต้องใส่เครดิต) สำหรับ "บริการ"
//      ซึ่งเก็บ icon เป็น emoji ในฐานข้อมูล → แปลงเป็นภาพสีอัตโนมัติ
//      ไม่ต้อง migrate ข้อมูล และ emoji ใหม่ที่ตั้งเองก็แสดงผลได้ทันที
// ============================================================
import {
  FcPhone, FcCallback, FcCalendar, FcBusinessContact, FcKey, FcViewDetails,
  FcInvite, FcManager, FcFullTrash, FcSearch, FcAdvertising, FcTodoList, FcGlobe,
  FcTimeline, FcLock, FcCamera, FcPackage, FcImport, FcClock, FcDocument,
  FcComboChart, FcLineChart, FcPaid, FcCollaboration, FcHighPriority, FcFolder,
  FcBullish, FcRefresh, FcLeave, FcExport, FcCheckmark, FcFeedback, FcInfo,
  FcPlus, FcCancel, FcDataSheet, FcSettings, FcEditImage, FcDownload,
} from "react-icons/fc";

// ---------- Twemoji: emoji (จากฐานข้อมูล) → ภาพ SVG สี ----------
import svgStethoscope from "@/assets/fluent-emoji/1fa7a.svg"; // 🩺
import svgTooth from "@/assets/fluent-emoji/1f9b7.svg";       // 🦷
import svgSparkles from "@/assets/fluent-emoji/2728.svg";     // ✨
import svgSyringe from "@/assets/fluent-emoji/1f489.svg";     // 💉
import svgLeaf from "@/assets/fluent-emoji/1f33f.svg";        // 🌿
import svgBrain from "@/assets/fluent-emoji/1f9e0.svg";       // 🧠
import svgEye from "@/assets/fluent-emoji/1f441.svg";         // 👁
import svgBone from "@/assets/fluent-emoji/1f9b4.svg";        // 🦴
import svgSpa from "@/assets/fluent-emoji/1f486.svg";         // 💆
import svgBaby from "@/assets/fluent-emoji/1f476.svg";        // 👶
import svgHeart from "@/assets/fluent-emoji/1fac0.svg";       // 🫀
import svgMicroscope from "@/assets/fluent-emoji/1f52c.svg";  // 🔬
import svgGlobe from "@/assets/fluent-emoji/1f310.svg";       // 🌐
import svgWalking from "@/assets/fluent-emoji/1f6b6.svg";     // 🚶
import svgHandshake from "@/assets/fluent-emoji/1f91d.svg";   // 🤝
import svgPhone from "@/assets/fluent-emoji/1f4de.svg";       // 📞

// Next.js คืน import ของ .svg เป็น object {src,...} — ดึง .src ออกมาเป็น URL
const urlOf = (m) => (typeof m === "string" ? m : (m && (m.src || m.default)) || "");
const EMOJI_SVG = {
  "🩺": urlOf(svgStethoscope), "🦷": urlOf(svgTooth), "✨": urlOf(svgSparkles), "💉": urlOf(svgSyringe),
  "🌿": urlOf(svgLeaf), "🧠": urlOf(svgBrain), "👁": urlOf(svgEye), "👁️": urlOf(svgEye), "🦴": urlOf(svgBone),
  "💆": urlOf(svgSpa), "👶": urlOf(svgBaby), "🫀": urlOf(svgHeart), "🔬": urlOf(svgMicroscope),
  "🌐": urlOf(svgGlobe), "🚶": urlOf(svgWalking), "🤝": urlOf(svgHandshake), "📞": urlOf(svgPhone),
};

const imgStyle = { display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0 };

// ไอคอนของ "บริการ" / ช่องทาง (ค่า emoji จากฐานข้อมูล) — แสดงเป็นภาพสีทุกเครื่อง
export function SvcIcon({ icon, size = "1em", style, ...rest }) {
  const src = EMOJI_SVG[icon];
  if (src) return <img src={src} alt="" aria-hidden style={{ ...imgStyle, height: size, width: size, ...style }} {...rest} />;
  return <span style={style} aria-hidden {...rest}>{icon}</span>; // emoji ที่ตั้งเองนอกตาราง — แสดงตามเดิม
}

// ตัวเลือก icon ในหน้าจัดการบริการ (ค่าที่ "บันทึก" ยังเป็น emoji เดิม — เข้ากับข้อมูลเก่าได้หมด)
export const SVC_ICONS = ["🩺", "🦷", "✨", "💉", "🌿", "🧠", "👁️", "🦴", "💆", "👶", "🫀", "🔬"];

// ---------- ไอคอน UI คงที่ — Icons8 Flat Color ----------
export {
  FcPhone as IconPhone, FcCallback as IconPhoneAlt, FcCalendar as IconCalendar,
  FcBusinessContact as IconAgency, FcKey as IconKey, FcViewDetails as IconEye,
  FcInvite as IconWalkin, FcManager as IconUser, FcFullTrash as IconTrash,
  FcSearch as IconSearch, FcAdvertising as IconMegaphone, FcTodoList as IconQueue,
  FcGlobe as IconGlobe, FcTimeline as IconHistory, FcLock as IconLock,
  FcCamera as IconCamera, FcPackage as IconBox, FcImport as IconImport, FcClock as IconClock,
  FcDocument as IconNote, FcComboChart as IconReport, FcLineChart as IconTrend,
  FcPaid as IconCard, FcCollaboration as IconUsers, FcHighPriority as IconWarn,
  FcFolder as IconFolder, FcBullish as IconFire, FcRefresh as IconRefresh,
  FcLeave as IconLogout, FcExport as IconCsv, FcCheckmark as IconCheck,
  FcFeedback as IconMail, FcInfo as IconInfo, FcPlus as IconPlus,
  FcCancel as IconFrown, FcDataSheet as IconExcel, FcSettings as IconSettings,
  FcEditImage as IconPencil, FcDownload as IconDownload,
};

// ไอคอนหูฟังแพทย์ (สี) — ใช้เป็น Twemoji เพราะ Flat Color ไม่มี
export const StethoscopeIcon = ({ size = "1em", ...rest }) => <SvcIcon icon="🩺" size={size} {...rest} />;

// ไอคอนแว่นขยาย+ (ดูรูปใหญ่ / lightbox) — วาดเองเพราะชุด Flat Color ไม่มีแบบที่ตรง
export const ZoomIcon = ({ size = "18px", ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <line x1="15.6" y1="15.6" x2="21" y2="21" />
    <line x1="10.5" y1="7.8" x2="10.5" y2="13.2" />
    <line x1="7.8" y1="10.5" x2="13.2" y2="10.5" />
  </svg>
);

export default SvcIcon;
