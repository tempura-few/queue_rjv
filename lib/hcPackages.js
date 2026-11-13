"use strict";
// ============================================================
// lib/hcPackages.js — แพ็กเกจตรวจสุขภาพ "จริง" จากเว็บโรงพยาบาล
// (rajavejchiangmai.com · โปรแกรมตรวจสุขภาพประจำปี 2569 · แผนกตรวจสุขภาพ ชั้น 2)
//
// ใช้ร่วมกัน:
//   1) lib/store.js — seed defaultServices ตอน DB ว่างครั้งแรก
//   2) scripts/set-default-banners.js — อัปเดตระบบที่มีข้อมูลอยู่แล้ว (เช่น production)
// ============================================================
const { itemBanner } = require("./banner.js");

// รูปโปรโมทจริงของแพ็กเกจ (ติดไปกับโค้ดใน public/pkg-images/)
const REAL_IMG = "/pkg-images/healthcheck-standard.jpg";

const PACKAGES = [
  {
    id: "hc-standard", name: "Standard 12 รายการ", nameEn: "Standard (12 items)", price: 1290, useRealImg: true,
    detail: "อายุ 18-30 ปี · ชาย/หญิง\nตรวจร่างกาย · เอกซเรย์ปอด · ปัสสาวะ · CBC · น้ำตาล (FBS) · ไขมัน · ไต · ตับ (SGPT)",
    detailEn: "Ages 18-30 · Male/Female\nPhysical exam · Chest X-ray · Urine · CBC · FBS · Lipid profile · Kidney · Liver (SGPT)",
  },
  {
    id: "hc-silver", name: "Silver 20 รายการ", nameEn: "Silver (20 items)", price: 1790,
    detail: "อายุ 31-40 ปี · ชาย/หญิง\nตรวจร่างกาย · เอกซเรย์ปอด · EKG · องค์ประกอบร่างกาย · CBC · FBS · ไขมันครบชุด · กรดยูริก · ไต · ตับ 3 ค่า",
    detailEn: "Ages 31-40 · Male/Female\nPhysical exam · Chest X-ray · EKG · Body composition · CBC · FBS · Full lipid · Uric acid · Kidney · Liver (3 tests)",
  },
  {
    id: "hc-gold", name: "Gold 26 รายการ", nameEn: "Gold (26 items)", price: 3290,
    detail: "อายุ 40 ปีขึ้นไป · ผู้ชาย\nตรวจร่างกาย · เอกซเรย์ปอด · EKG · CBC · FBS · ไขมันครบชุด · ไต · ตับ 6 ค่า\nคัดกรองมะเร็ง: PSA · CEA · AFP",
    detailEn: "Ages 40+ · Male\nPhysical exam · Chest X-ray · EKG · CBC · FBS · Full lipid · Kidney · Liver (6 tests)\nCancer screening: PSA · CEA · AFP",
  },
  {
    id: "hc-rosegold", name: "Rose Gold 27 รายการ", nameEn: "Rose Gold (27 items)", price: 5990,
    detail: "อายุ 40 ปีขึ้นไป · ผู้หญิง\nตรวจร่างกาย · เอกซเรย์ปอด · EKG · CBC · FBS · ไขมันครบชุด · ไต · ตับ 6 ค่า\nอัลตร้าซาวด์ช่องท้อง · คัดกรองมะเร็งปากมดลูก (Thin Prep) · CEA · AFP",
    detailEn: "Ages 40+ · Female\nPhysical exam · Chest X-ray · EKG · CBC · FBS · Full lipid · Kidney · Liver (6 tests)\nAbdominal ultrasound · Cervical screening (Thin Prep) · CEA · AFP",
  },
  {
    id: "hc-platinum", name: "Platinum 27 รายการ", nameEn: "Platinum (27 items)", price: 5790,
    detail: "อายุ 40 ปีขึ้นไป · ผู้ชาย\nตรวจร่างกาย · เอกซเรย์ปอด · EKG · CBC · FBS · ไขมันครบชุด · ไต · ตับ 6 ค่า\nอัลตร้าซาวด์ช่องท้อง · คัดกรองมะเร็ง: PSA · CEA · AFP",
    detailEn: "Ages 40+ · Male\nPhysical exam · Chest X-ray · EKG · CBC · FBS · Full lipid · Kidney · Liver (6 tests)\nAbdominal ultrasound · Cancer screening: PSA · CEA · AFP",
  },
  {
    id: "hc-diamond", name: "Diamond 28 รายการ", nameEn: "Diamond (28 items)", price: 7590,
    detail: "อายุ 40 ปีขึ้นไป · ผู้หญิง\nตรวจร่างกาย · เอกซเรย์ปอด · EKG · CBC · FBS · ไขมันครบชุด · ไต · ตับ 6 ค่า\nอัลตร้าซาวด์ช่องท้อง · แมมโมแกรม · คัดกรองมะเร็งปากมดลูก · CEA · AFP",
    detailEn: "Ages 40+ · Female\nPhysical exam · Chest X-ray · EKG · CBC · FBS · Full lipid · Kidney · Liver (6 tests)\nAbdominal ultrasound · Mammogram · Cervical screening · CEA · AFP",
  },
];

// รายการย่อยของบริการ "ตรวจสุขภาพ" — Standard ใช้รูปโปรโมทจริง ที่เหลือใช้แบนเนอร์กราฟิก
function hcItems() {
  return PACKAGES.map((p) => ({
    id: p.id, name: p.name, nameEn: p.nameEn, price: p.price,
    image: p.useRealImg ? REAL_IMG : itemBanner("healthcheck", p.name),
    detail: p.detail, detailEn: p.detailEn,
  }));
}

module.exports = { hcItems, PACKAGES };
