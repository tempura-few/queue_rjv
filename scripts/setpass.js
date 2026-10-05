// เปลี่ยนรหัสผ่านผู้ใช้: node scripts/setpass.js <username> <รหัสใหม่>
// (ทำงานตามโหมดเก็บข้อมูลที่ตั้งด้วย env STORAGE — เหมือน server ทุกอย่าง)
"use strict";
const crypto = require("crypto");
const store = require("../store.js");
const [username, password] = process.argv.slice(2);
(async () => {
  if (!username || !password || password.length < 6) {
    console.log("วิธีใช้: node scripts/setpass.js <username> <รหัสใหม่ (6 ตัวขึ้นไป)>");
    process.exit(1);
  }
  await store.init();
  const u = store.db.users.find((x) => x.username === username);
  if (!u) { console.log("ไม่พบผู้ใช้: " + username); process.exit(1); }
  u.salt = crypto.randomBytes(16).toString("hex");
  u.hash = crypto.scryptSync(password, u.salt, 64).toString("hex");
  await store.setUserPassword(u);
  console.log("เปลี่ยนรหัสผ่านของ " + username + " เรียบร้อย (" + store.mode + ")");
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
