// เพิ่มผู้ใช้เจ้าหน้าที่: node scripts/useradd.js <username> <ชื่อ-นามสกุล> <รหัสผ่าน> [admin|sale|cs]
// (ทำงานตามโหมดเก็บข้อมูลที่ตั้งด้วย env STORAGE — เหมือน server ทุกอย่าง)
// หมายเหตุ: จะเพิ่ม/แก้ไข/ลบผู้ใช้จากหน้าเว็บก็ได้ (เมนู "จัดการผู้ใช้" ของ admin)
"use strict";
const store = require("../lib/store.js");
const { ROLES } = require("../lib/roles.js");
const [username, name, password, role = "cs"] = process.argv.slice(2);
(async () => {
  if (!username || !name || !password || password.length < 6) {
    console.log("วิธีใช้: node scripts/useradd.js <username> <ชื่อ-นามสกุล> <รหัสผ่าน (6 ตัวขึ้นไป)> [admin|sale|cs]");
    process.exit(1);
  }
  if (!ROLES[role]) { console.log("สิทธิ์ต้องเป็นหนึ่งใน: admin | sale | cs"); process.exit(1); }
  await store.init();
  if (store.db.users.some((u) => u.username === username)) { console.log("มีผู้ใช้นี้อยู่แล้ว: " + username); process.exit(1); }
  const u = store.makeUser(username, name, password, role);
  await store.addUser(u);
  console.log(`เพิ่มผู้ใช้ ${username} (${name}, สิทธิ์ ${role} — ${ROLES[role].label}) เรียบร้อย (${store.mode})`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
