"use strict";
// ============================================================
// scripts/set-default-banners.js — ใส่ "รูปแบนเนอร์เริ่มต้น" ให้บริการที่มีข้อมูลอยู่แล้ว
//
// ค่า seed (lib/store.js defaultServices) จะใส่รูปให้เฉพาะตอนฐานข้อมูล "ว่าง" ครั้งแรก
// สคริปต์นี้ใช้กับระบบที่ "มีข้อมูลอยู่แล้ว" — ดึงบริการทั้งหมดมา ใส่รูปแบนเนอร์
// (จาก lib/banner.js) ให้บริการที่รู้จัก แล้วบันทึกกลับ ผ่าน API เดียวกับหลังบ้าน
//
// รัน:  node scripts/set-default-banners.js
//   (ต้องเปิดเซิร์ฟเวอร์อยู่แล้ว · ใช้ ADMIN_USER/ADMIN_PASS · BASE_URL ถ้าไม่ใช่ localhost:3000)
// ============================================================
const { bannerFor, itemBanner, SERVICE_BANNERS } = require("../lib/banner.js");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "admin";

(async () => {
  const login = await fetch(BASE + "/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) { console.error("ล็อกอินไม่สำเร็จ:", login.status); process.exit(1); }
  const { token } = await login.json();
  const H = { Authorization: "Bearer " + token };

  const { services } = await (await fetch(BASE + "/api/services", { headers: H })).json();
  let changed = 0, itemChanged = 0;
  for (const s of services) {
    delete s.hasImage; // hasImage เป็นค่าคำนวณตอน GET — ไม่ควรเก็บลงฐานข้อมูล
    const b = bannerFor(s.id);
    if (b) { s.image = b; changed++; } // บริการที่เพิ่มเอง (ไม่รู้จัก) จะไม่ถูกรูปเดิม
    if (Array.isArray(s.items)) {
      for (const it of s.items) {
        delete it.hasImage;
        // ป้ายชื่อบนแบนเนอร์ — ตัดคำวงเล็บท้ายออก (เช่น "(ต่อเข็ม)") ให้กระชับ
        const label = String(it.name || "").replace(/\s*\(.*?\)\s*$/g, "").trim() || it.name;
        const ib = itemBanner(s.id, label);
        if (ib) { it.image = ib; itemChanged++; }
      }
    }
  }
  const put = await fetch(BASE + "/api/services", {
    method: "PUT", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
  });
  if (!put.ok) { console.error("บันทึกไม่สำเร็จ:", put.status, await put.text()); process.exit(1); }
  console.log(`✓ ใส่รูปแบนเนอร์เริ่มต้นให้ ${changed} บริการ และ ${itemChanged} รายการย่อย`);
})().catch((e) => { console.error(e); process.exit(1); });
