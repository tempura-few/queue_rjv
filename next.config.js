// คอนฟิก Next.js
// rewrite ให้ลิงก์เดิม *.html (ที่ฝังไว้ใน WordPress/เอกสารเก่า) ยังเข้าได้ — ไม่ต้องแก้ลิงก์ที่ไหน
// output: "standalone" — build แล้วได้ .next/standalone (รวมแค่ dependency ที่ใช้จริงตอนรัน)
// ทำให้ Docker image เล็กลงมาก (~250 MB จาก ~1.2 GB) — รันด้วย node server.js ดู Dockerfile
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // PDPA/Security: header พื้นฐานทุกหน้า — กัน MIME sniffing, กันถูกฝัง iframe (clickjacking), จำกัด referer
  // (ส่วน HTTPS/HSTS จบที่ nginx — ดู deploy/nginx-queue.conf)
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    const noStore = { key: "Cache-Control", value: "no-store, must-revalidate" };
    return [
      // ⚠️ HTML ห้ามแคชยาว — Next.js ตั้ง s-maxage=31536000 (1 ปี) ให้หน้า static โดยดีฟอลต์
      // ทำให้ nginx (proxy cache บนเซิร์ฟเวอร์) เก็บ "หน้าเก่า" ไว้ แม้ deploy โค้ดใหม่แล้ว (เกิดขึ้นจริง)
      // (ยกเว้น /_next/static ที่ชื่อไฟล์เป็น hash เปลี่ยนทุก build → แคชยาวปลอดภัย ตามหลัง catch-all เพื่อ override)
      { source: "/:path*", headers: [...common, noStore] },
      { source: "/_next/static/:path*", headers: [...common, { key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // หน้าหลังบ้าน/ล็อกอิน: ห้ามฝัง iframe เด็ดขาด (clickjacking) — หน้าอื่นไม่ใส่ X-Frame-Options รองรับโหมด embed (?embed=1)
      { source: "/admin", headers: [...common, noStore, { key: "X-Frame-Options", value: "DENY" }] },
      { source: "/login", headers: [...common, noStore, { key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
  async rewrites() {
    return [
      { source: "/index.html", destination: "/" },
      { source: "/booking.html", destination: "/booking" },
      { source: "/success.html", destination: "/success" },
      { source: "/login.html", destination: "/login" },
      { source: "/admin.html", destination: "/admin" },
    ];
  },
};

module.exports = nextConfig;
