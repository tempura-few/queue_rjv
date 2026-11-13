"use strict";
// ============================================================
// lib/hcPackages.js — แพ็กเกจตรวจสุขภาพ "จริง" จากเว็บโรงพยาบาล
// (rajavejchiangmai.com · โปรแกรมตรวจสุขภาพประจำปี 2569 · แผนกตรวจสุขภาพ ชั้น 2)
// รายการตรวจ "ครบทุกข้อ" ตามหน้าเว็บของแต่ละแพ็กเกจ (ไทย + อังกฤษ)
//
// ใช้ร่วมกัน:
//   1) lib/store.js — seed defaultServices ตอน DB ว่างครั้งแรก
//   2) scripts/set-default-banners.js — อัปเดตระบบที่มีข้อมูลอยู่แล้ว (เช่น production)
// ============================================================

// ---------- รายการตรวจ (ตามหน้าเว็บ แยกแพ็กเกจ เรียงตามลำดับเดิม) ----------
const LISTS = {
  standard: {
    th: ["ซักประวัติ", "ตรวจร่างกายโดยแพทย์", "ชั่งน้ำหนัก วัดส่วนสูง วัดความดันโลหิต", "หาค่าดัชนีมวลกาย", "การเอกซเรย์ปอด", "ตรวจปัสสาวะ", "ตรวจความสมบูรณ์เม็ดเลือด", "การตรวจระดับน้ำตาลในเลือด", "ไขมันชนิดคอเลสเตอรอล (รวม)", "ไขมันชนิดไตรกลีเซอไรด์", "ค่าการทำงานของไต (Creatinine)", "ค่าการทำงานของตับ (SGPT)"],
    en: ["Screening", "Physical Examination", "Vital Signs", "Body Mass Index (BMI)", "Chest X-ray", "Urine Examination", "Complete Blood Count (CBC)", "Fasting Blood Sugar (FBS)", "Cholesterol", "Triglyceride", "Kidney Function Test (Creatinine)", "Liver Function Test (SGPT)"],
  },
  silver: {
    th: ["ซักประวัติ", "ตรวจร่างกายโดยแพทย์", "ชั่งน้ำหนัก วัดส่วนสูง วัดความดันโลหิต", "หาค่าดัชนีมวลกาย", "การเอกซเรย์ปอด", "ตรวจปัสสาวะ", "ตรวจวิเคราะห์องค์ประกอบร่างกาย", "ตรวจคลื่นไฟฟ้าหัวใจ", "ตรวจความสมบูรณ์เม็ดเลือด", "การตรวจระดับน้ำตาลในเลือด", "ไขมันชนิดคอเลสเตอรอล (รวม)", "ไขมันชนิดไตรกลีเซอไรด์", "คอเลสเตอรอล (ชนิดดี)", "คอเลสเตอรอล (ชนิดไม่ดี)", "ตรวจกรดยูริกในเลือด", "ค่าการทำงานของไต (BUN)", "ค่าการทำงานของไต (Creatinine)", "ค่าการทำงานของตับ (SGOT)", "ค่าการทำงานของตับ (SGPT)", "ค่าการทำงานของตับ (ALP)"],
    en: ["Screening", "Physical Examination", "Vital Signs", "Body Mass Index (BMI)", "Chest X-ray", "Urine Examination", "Body Composition Analyzer", "Electrocardiogram (EKG)", "Complete Blood Count (CBC)", "Fasting Blood Sugar (FBS)", "Cholesterol", "Triglyceride", "HDL-Cholesterol", "LDL-Cholesterol", "Uric Acid", "Kidney Function Test (BUN)", "Kidney Function Test (Creatinine)", "Liver Function Test (SGOT)", "Liver Function Test (SGPT)", "Liver Function Test (ALP)"],
  },
  gold: {
    th: ["ซักประวัติ", "ตรวจร่างกายโดยแพทย์", "ชั่งน้ำหนัก วัดส่วนสูง วัดความดันโลหิต", "หาค่าดัชนีมวลกาย", "การเอกซเรย์ปอด", "ตรวจปัสสาวะ", "ตรวจวิเคราะห์องค์ประกอบร่างกาย", "ตรวจคลื่นไฟฟ้าหัวใจ", "ตรวจความสมบูรณ์เม็ดเลือด", "การตรวจระดับน้ำตาลในเลือด", "ไขมันชนิดคอเลสเตอรอล (รวม)", "ไขมันชนิดไตรกลีเซอไรด์", "คอเลสเตอรอล (ชนิดดี)", "คอเลสเตอรอล (ชนิดไม่ดี)", "ตรวจกรดยูริกในเลือด", "ค่าการทำงานของไต (BUN)", "ค่าการทำงานของไต (Creatinine)", "ค่าการทำงานของตับ (SGOT)", "ค่าการทำงานของตับ (SGPT)", "ค่าการทำงานของตับ (ALP)", "ค่าการทำงานของตับ (Total Protein)", "ค่าการทำงานของตับ (Albumin)", "ค่าการทำงานของตับ (Globulin)", "ค่าบ่งชี้มะเร็งต่อมลูกหมาก (PSA)", "ค่าบ่งชี้มะเร็งลำไส้ใหญ่ (CEA)", "ค่าบ่งชี้มะเร็งตับ (AFP)"],
    en: ["Screening", "Physical Examination", "Vital Signs", "Body Mass Index (BMI)", "Chest X-ray", "Urine Examination", "Body Composition Analyzer", "Electrocardiogram (EKG)", "Complete Blood Count (CBC)", "Fasting Blood Sugar (FBS)", "Cholesterol", "Triglyceride", "HDL-Cholesterol", "LDL-Cholesterol", "Uric Acid", "Kidney Function Test (BUN)", "Kidney Function Test (Creatinine)", "Liver Function Test (SGOT)", "Liver Function Test (SGPT)", "Liver Function Test (ALP)", "Liver Function Test (Total Protein)", "Liver Function Test (Albumin)", "Liver Function Test (Globulin)", "Tumor Marker for Prostate Cancer (PSA)", "Tumor Marker for GI Cancer (CEA)", "Tumor Marker for Liver Cancer (AFP)"],
  },
  rosegold: {
    th: ["ซักประวัติ", "ตรวจร่างกายโดยแพทย์", "ชั่งน้ำหนัก วัดส่วนสูง วัดความดันโลหิต", "หาค่าดัชนีมวลกาย", "การเอกซเรย์ปอด", "ตรวจปัสสาวะ", "ตรวจวิเคราะห์องค์ประกอบร่างกาย", "ตรวจคลื่นไฟฟ้าหัวใจ", "ตรวจความสมบูรณ์เม็ดเลือด", "การตรวจระดับน้ำตาลในเลือด", "ไขมันชนิดคอเลสเตอรอล (รวม)", "ไขมันชนิดไตรกลีเซอไรด์", "คอเลสเตอรอล (ชนิดดี)", "คอเลสเตอรอล (ชนิดไม่ดี)", "ตรวจกรดยูริกในเลือด", "ค่าการทำงานของไต (BUN)", "ค่าการทำงานของไต (Creatinine)", "ค่าการทำงานของตับ (SGOT)", "ค่าการทำงานของตับ (SGPT)", "ค่าการทำงานของตับ (ALP)", "ค่าการทำงานของตับ (Total Protein)", "ค่าการทำงานของตับ (Albumin)", "ค่าการทำงานของตับ (Globulin)", "ตรวจอัลตร้าซาวด์ช่องท้อง", "ตรวจคัดกรองมะเร็งปากมดลูก (Thin Prep)", "ค่าบ่งชี้มะเร็งลำไส้ใหญ่ (CEA)", "ค่าบ่งชี้มะเร็งตับ (AFP)"],
    en: ["Screening", "Physical Examination", "Vital Signs", "Body Mass Index (BMI)", "Chest X-ray", "Urine Examination", "Body Composition Analyzer", "Electrocardiogram (EKG)", "Complete Blood Count (CBC)", "Fasting Blood Sugar (FBS)", "Cholesterol", "Triglyceride", "HDL-Cholesterol", "LDL-Cholesterol", "Uric Acid", "Kidney Function Test (BUN)", "Kidney Function Test (Creatinine)", "Liver Function Test (SGOT)", "Liver Function Test (SGPT)", "Liver Function Test (ALP)", "Liver Function Test (Total Protein)", "Liver Function Test (Albumin)", "Liver Function Test (Globulin)", "Ultrasound Whole Abdomen", "Screening for Cervical Cancer (Thin Prep)", "Tumor Marker for GI Cancer (CEA)", "Tumor Marker for Liver Cancer (AFP)"],
  },
  platinum: {
    th: ["ซักประวัติ", "ตรวจร่างกายโดยแพทย์", "ชั่งน้ำหนัก วัดส่วนสูง วัดความดันโลหิต", "หาค่าดัชนีมวลกาย", "การเอกซเรย์ปอด", "ตรวจปัสสาวะ", "ตรวจวิเคราะห์องค์ประกอบร่างกาย", "ตรวจคลื่นไฟฟ้าหัวใจ", "ตรวจความสมบูรณ์เม็ดเลือด", "การตรวจระดับน้ำตาลในเลือด", "ไขมันชนิดคอเลสเตอรอล (รวม)", "ไขมันชนิดไตรกลีเซอไรด์", "คอเลสเตอรอล (ชนิดดี)", "คอเลสเตอรอล (ชนิดไม่ดี)", "ตรวจกรดยูริกในเลือด", "ค่าการทำงานของไต (BUN)", "ค่าการทำงานของไต (Creatinine)", "ค่าการทำงานของตับ (SGOT)", "ค่าการทำงานของตับ (SGPT)", "ค่าการทำงานของตับ (ALP)", "ค่าการทำงานของตับ (Total Protein)", "ค่าการทำงานของตับ (Albumin)", "ค่าการทำงานของตับ (Globulin)", "ตรวจอัลตร้าซาวด์ช่องท้อง", "ค่าบ่งชี้มะเร็งต่อมลูกหมาก (PSA)", "ค่าบ่งชี้มะเร็งลำไส้ใหญ่ (CEA)", "ค่าบ่งชี้มะเร็งตับ (AFP)"],
    en: ["Screening", "Physical Examination", "Vital Signs", "Body Mass Index (BMI)", "Chest X-ray", "Urine Examination", "Body Composition Analyzer", "Electrocardiogram (EKG)", "Complete Blood Count (CBC)", "Fasting Blood Sugar (FBS)", "Cholesterol", "Triglyceride", "HDL-Cholesterol", "LDL-Cholesterol", "Uric Acid", "Kidney Function Test (BUN)", "Kidney Function Test (Creatinine)", "Liver Function Test (SGOT)", "Liver Function Test (SGPT)", "Liver Function Test (ALP)", "Liver Function Test (Total Protein)", "Liver Function Test (Albumin)", "Liver Function Test (Globulin)", "Ultrasound Whole Abdomen", "Tumor Marker for Prostate Cancer (PSA)", "Tumor Marker for GI Cancer (CEA)", "Tumor Marker for Liver Cancer (AFP)"],
  },
  diamond: {
    th: ["ซักประวัติ", "ตรวจร่างกายโดยแพทย์", "ชั่งน้ำหนัก วัดส่วนสูง วัดความดันโลหิต", "หาค่าดัชนีมวลกาย", "การเอกซเรย์ปอด", "ตรวจปัสสาวะ", "ตรวจวิเคราะห์องค์ประกอบร่างกาย", "ตรวจคลื่นไฟฟ้าหัวใจ", "ตรวจความสมบูรณ์เม็ดเลือด", "การตรวจระดับน้ำตาลในเลือด", "ไขมันชนิดคอเลสเตอรอล (รวม)", "ไขมันชนิดไตรกลีเซอไรด์", "คอเลสเตอรอล (ชนิดดี)", "คอเลสเตอรอล (ชนิดไม่ดี)", "ตรวจกรดยูริกในเลือด", "ค่าการทำงานของไต (BUN)", "ค่าการทำงานของไต (Creatinine)", "ค่าการทำงานของตับ (SGOT)", "ค่าการทำงานของตับ (SGPT)", "ค่าการทำงานของตับ (ALP)", "ค่าการทำงานของตับ (Total Protein)", "ค่าการทำงานของตับ (Albumin)", "ค่าการทำงานของตับ (Globulin)", "ตรวจอัลตร้าซาวด์ช่องท้อง", "ตรวจแมมโมแกรม", "ตรวจคัดกรองมะเร็งปากมดลูก (Thin Prep)", "ค่าบ่งชี้มะเร็งลำไส้ใหญ่ (CEA)", "ค่าบ่งชี้มะเร็งตับ (AFP)"],
    en: ["Screening", "Physical Examination", "Vital Signs", "Body Mass Index (BMI)", "Chest X-ray", "Urine Examination", "Body Composition Analyzer", "Electrocardiogram (EKG)", "Complete Blood Count (CBC)", "Fasting Blood Sugar (FBS)", "Cholesterol", "Triglyceride", "HDL-Cholesterol", "LDL-Cholesterol", "Uric Acid", "Kidney Function Test (BUN)", "Kidney Function Test (Creatinine)", "Liver Function Test (SGOT)", "Liver Function Test (SGPT)", "Liver Function Test (ALP)", "Liver Function Test (Total Protein)", "Liver Function Test (Albumin)", "Liver Function Test (Globulin)", "Ultrasound Whole Abdomen", "Mammogram", "Screening for Cervical Cancer (Thin Prep)", "Tumor Marker for GI Cancer (CEA)", "Tumor Marker for Liver Cancer (AFP)"],
  },
};

// จัดรูปแบบ: บรรทัดแรก = กลุ่มเป้าหมาย · จำนวนรายการ, ตามด้วยรายการตรวจเรียงเลข, ปิดท้ายการเตรียมตัว
const fmt = (arr) => arr.map((x, i) => `${i + 1}. ${x}`).join("\n");
const PREP_TH = "งดน้ำและอาหารอย่างน้อย 8-12 ชั่วโมงก่อนตรวจ";
const PREP_EN = "Fast (no food/water) 8-12 hours before check-up";

const PACKAGES = [
  {
    id: "hc-standard", name: "Standard 12 รายการ", nameEn: "Standard (12 items)", price: 1290,
    targetTh: "อายุ 18-30 ปี · ชาย/หญิง", targetEn: "Ages 18-30 · Male/Female", list: LISTS.standard,
  },
  {
    id: "hc-silver", name: "Silver 20 รายการ", nameEn: "Silver (20 items)", price: 1790,
    targetTh: "อายุ 31-40 ปี · ชาย/หญิง", targetEn: "Ages 31-40 · Male/Female", list: LISTS.silver,
  },
  {
    id: "hc-gold", name: "Gold 26 รายการ", nameEn: "Gold (26 items)", price: 3290,
    targetTh: "อายุ 40 ปีขึ้นไป · ผู้ชาย", targetEn: "Ages 40+ · Male", list: LISTS.gold,
  },
  {
    id: "hc-rosegold", name: "Rose Gold 27 รายการ", nameEn: "Rose Gold (27 items)", price: 5990,
    targetTh: "อายุ 40 ปีขึ้นไป · ผู้หญิง", targetEn: "Ages 40+ · Female", list: LISTS.rosegold,
  },
  {
    id: "hc-platinum", name: "Platinum 27 รายการ", nameEn: "Platinum (27 items)", price: 5790,
    targetTh: "อายุ 40 ปีขึ้นไป · ผู้ชาย", targetEn: "Ages 40+ · Male", list: LISTS.platinum,
  },
  {
    id: "hc-diamond", name: "Diamond 28 รายการ", nameEn: "Diamond (28 items)", price: 7590,
    targetTh: "อายุ 40 ปีขึ้นไป · ผู้หญิง", targetEn: "Ages 40+ · Female", list: LISTS.diamond,
  },
];

// รายการย่อยของบริการ "ตรวจสุขภาพ" — ทุกแพ็กเกจใช้ "รูปโปรโมทจริง" (ตาม id: /pkg-images/healthcheck-<id>.jpg)
function hcItems() {
  return PACKAGES.map((p) => ({
    id: p.id, name: p.name, nameEn: p.nameEn, price: p.price,
    image: `/pkg-images/${p.id}.jpg`,
    detail: `${p.targetTh}\n${fmt(p.list.th)}\n${PREP_TH}`,
    detailEn: `${p.targetEn}\n${fmt(p.list.en)}\n${PREP_EN}`,
  }));
}

module.exports = { hcItems, PACKAGES };
