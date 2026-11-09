// ============================================================
// instrumentation.js — ด่านตรวจตอนเซิร์ฟเวอร์ "start จริง" (ไม่รันตอน next build)
// PDPA: production ต้องตั้ง AUTH_SECRET เป็นค่าสุ่มของตัวเองเสมอ —
// ถ้าไม่ตั้ง ปฏิเสธการ start ทันที เพื่อไม่ให้เผลอไปรันด้วยคีย์ชั่วคราว
// (token ตายทุก restart) หรือคีย์เก่าที่เคยหลุดอยู่ใน repo
// ============================================================
exports.register = async () => {
  // ข้ามตอน build (next build ตั้ง NODE_ENV=production แต่ยังไม่ใช่การรันเซิร์ฟเวอร์)
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET)
    throw new Error("[auth] production ต้องตั้ง AUTH_SECRET (สร้างค่าสุ่ม: openssl rand -hex 32) — ปฏิเสธการ start ด้วยคีย์ชั่วคราว ดู .env.example");
};
