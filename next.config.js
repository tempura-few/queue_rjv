// คอนฟิก Next.js
// rewrite ให้ลิงก์เดิม *.html (ที่ฝังไว้ใน WordPress/เอกสารเก่า) ยังเข้าได้ — ไม่ต้องแก้ลิงก์ที่ไหน
/** @type {import('next').NextConfig} */
const nextConfig = {
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
