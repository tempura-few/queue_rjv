import "./globals.css";

export const metadata = {
  title: "ระบบจองคิว — โรงพยาบาลราชเวช เชียงใหม่",
  description: "จองคิวล่วงหน้าออนไลน์ สะดวก ไม่ต้องรอ — ทุกช่องทางในที่เดียว",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
