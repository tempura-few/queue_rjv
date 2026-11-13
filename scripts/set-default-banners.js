"use strict";
// ============================================================
// scripts/set-default-banners.js — ติดตั้ง "หน้าตาเริ่มต้น" ให้ระบบที่มีข้อมูลอยู่แล้ว
//
// ค่า seed (lib/store.js defaultServices) มีรูป/หมวดหมู่/รายละเอียดเฉพาะตอน DB ว่างครั้งแรก
// สคริปต์นี้ใช้กับระบบที่ "มีข้อมูลอยู่แล้ว" (เช่น production ที่ deploy โค้ดใหม่เข้าไป)
// ใส่ให้ครบชุดผ่าน API เดียวกับหลังบ้าน:
//   - หมวดหมู่ (แสดงเป็นแท็บกรองบนหน้าจอง)
//   - รูปบริการ/รายการย่อย = แบนเนอร์กราฟิก (lib/banner.js)
//   - ตรวจสุขภาพ: รายการย่อยใช้รูปโปรโมทจริง /pkg-images/healthcheck-standard.jpg + รายละเอียด th/en
//
// รัน:  node scripts/set-default-banners.js
//   กับ production:  BASE_URL=https://<โดเมน> ADMIN_USER=admin ADMIN_PASS=<รหัส> node scripts/set-default-banners.js
//
// หมายเหตุ: จะ "ทับ" รูป/หมวด/รายละเอียดของบริการที่รู้จัก (id ตรง seed) —
//   ถ้าเจ้าหน้าที่ใส่รูปเองแล้วไม่อยากโดนทับ อย่ารันซ้ำ หรือเข้าหลังบ้านตั้งเองแทน
// ============================================================
const { bannerFor, itemBanner } = require("../lib/banner.js");
const { hcItems } = require("../lib/hcPackages.js");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "admin";

// หมวดหมู่ของบริการที่รู้จัก (ตรง defaultServices ใน lib/store.js)
const CATS = {
  healthcheck: "ตรวจสุขภาพ",
  dental: "ทันตกรรม",
  beauty: "ความงาม",
  vaccine: "วัคซีน",
  tcm: "แพทย์ทางเลือก",
};

(async () => {
  const login = await fetch(BASE + "/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) { console.error("ล็อกอินไม่สำเร็จ:", login.status); process.exit(1); }
  const { token } = await login.json();
  const H = { Authorization: "Bearer " + token };

  const { services } = await (await fetch(BASE + "/api/services", { headers: H })).json();
  let catSet = 0, svcImg = 0, itemImg = 0;
  for (const s of services) {
    delete s.hasImage; // hasImage เป็นค่าคำนวณตอน GET — ไม่ควรเก็บลงฐานข้อมูล
    if (CATS[s.id]) { s.category = CATS[s.id]; catSet++; }
    const b = bannerFor(s.id);
    if (b) { s.image = b; svcImg++; } // บริการที่เพิ่มเอง (ไม่รู้จัก) จะไม่ถูกแตะ
    // ตรวจสุขภาพ: รายการย่อย = แพ็กเกจจริงตามเว็บโรงพยาบาล (Standard→Diamond)
    if (s.id === "healthcheck") { s.items = hcItems(); itemImg += s.items.length; continue; }
    if (Array.isArray(s.items)) {
      for (const it of s.items) {
        delete it.hasImage;
        // รายการอื่น: แบนเนอร์กราฟิก — ป้ายชื่อตัดคำวงเล็บท้ายออก (เช่น "(ต่อเข็ม)") ให้กระชับ
        const label = String(it.name || "").replace(/\s*\(.*?\)\s*$/g, "").trim() || it.name;
        const ib = itemBanner(s.id, label);
        if (ib) { it.image = ib; itemImg++; }
      }
    }
  }
  const put = await fetch(BASE + "/api/services", {
    method: "PUT", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
  });
  if (!put.ok) { console.error("บันทึกไม่สำเร็จ:", put.status, await put.text()); process.exit(1); }
  console.log(`✓ ติดตั้งหน้าตาเริ่มต้น: หมวดหมู่ ${catSet} บริการ · รูปบริการ ${svcImg} · รูป+รายละเอียดรายการย่อย ${itemImg}`);
})().catch((e) => { console.error(e); process.exit(1); });
