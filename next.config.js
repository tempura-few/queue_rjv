// คอนฟิก Next.js
// rewrite ให้ลิงก์เดิม *.html (ที่ฝังไว้ใน WordPress/เอกสารเก่า) ยังเข้าได้ — ไม่ต้องแก้ลิงก์ที่ไหน
// output: "standalone" — build แล้วได้ .next/standalone (รวมแค่ dependency ที่ใช้จริงตอนรัน)
// ทำให้ Docker image เล็กลงมาก (~250 MB จาก ~1.2 GB) — รันด้วย node server.js ดู Dockerfile
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
