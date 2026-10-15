"use client";

// Error boundary ฝั่ง client (แทนข้อความอังกฤษ "Application error: a client-side
// exception" ของ Next.js) — กรณีที่พบบ่อยคือแท็บที่เปิดค้างจากเวอร์ชันก่อนพยายามโหลด
// ไฟล์สคริปต์ชุดเก่าที่ถูกแทนที่ไปแล้วตอน deploy ใหม่ → แก้ด้วยการ reload หน้าเอง
// ครั้งเดียว (กันวนลูปด้วย sessionStorage)
import { useEffect } from "react";

const CHUNK_FAIL = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i;

export default function AppError({ error, reset }) {
  useEffect(() => {
    const msg = String(error?.message || "");
    if (CHUNK_FAIL.test(msg) && !sessionStorage.getItem("q_chunk_reload")) {
      sessionStorage.setItem("q_chunk_reload", "1");
      location.reload();
      return;
    }
    // ไม่ใช่ chunk error — เคลียร์ธงไว้ให้ครั้งหน้ากู้ตัวได้อีก
    sessionStorage.removeItem("q_chunk_reload");
  }, [error]);

  const reload = () => {
    sessionStorage.removeItem("q_chunk_reload");
    location.reload();
  };

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ margin: "8px 0 4px" }}>หน้าเว็บขัดข้องชั่วคราว</h2>
        <p style={{ color: "#64748b", margin: "0 0 18px" }}>
          อาจเกิดจากระบบเพิ่งอัปเดตเวอร์ชันใหม่ในขณะที่หน้านี้เปิดค้างอยู่
          กดปุ่มด้านล่างเพื่อโหลดหน้าใหม่ได้เลย
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={reload} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#13497F", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.95rem" }}>
            โหลดหน้าใหม่
          </button>
          <button onClick={reset} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontWeight: 700, cursor: "pointer", fontSize: "0.95rem" }}>
            ลองใหม่
          </button>
        </div>
      </div>
    </div>
  );
}
